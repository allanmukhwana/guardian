import { DidDocumentStatus, DocumentStatus, MessageAPI, Schema, SchemaEntity, SchemaHelper, TopicType, UserRole, WorkerTaskType } from '@guardian/interfaces';
import { ApiResponse } from '@api/helpers/api-response';
import {
    CommonDidDocument,
    DataBaseHelper,
    DidDocument as DidDocumentCollection,
    DIDMessage,
    HederaBBSMethod,
    HederaEd25519Method,
    IAuthUser,
    KeyType,
    Logger,
    MessageAction,
    MessageError,
    MessageResponse,
    MessageServer,
    RegistrationMessage,
    RunFunctionAsync,
    Schema as SchemaCollection,
    Settings,
    Topic,
    TopicConfig,
    TopicHelper,
    Users,
    VcDocument as VcDocumentCollection,
    VcHelper,
    VCMessage,
    Wallet,
    Workers
} from '@guardian/common';
import { emptyNotifier, initNotifier, INotifier } from '@helpers/notifier';
import { RestoreDataFromHedera } from '@helpers/restore-data-from-hedera';
import { publishSystemSchema } from './helpers/schema-publish-helper';
import { Controller, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

/**
 * Get global topic
 */
// tslint:disable-next-line:completed-docs
async function getGlobalTopic(): Promise<TopicConfig | null> {
    try {
        const topicId = await new DataBaseHelper(Settings).findOne({
            name: 'INITIALIZATION_TOPIC_ID'
        });
        const topicKey = await new DataBaseHelper(Settings).findOne({
            name: 'INITIALIZATION_TOPIC_KEY'
        });
        const INITIALIZATION_TOPIC_ID = topicId?.value || process.env.INITIALIZATION_TOPIC_ID;
        const INITIALIZATION_TOPIC_KEY = topicKey?.value || process.env.INITIALIZATION_TOPIC_KEY;
        return new TopicConfig({ topicId: INITIALIZATION_TOPIC_ID }, null, INITIALIZATION_TOPIC_KEY);
    } catch (error) {
        console.error(error);
        return null;
    }
}

/**
 * Set up user profile
 * @param username
 * @param profile
 * @param notifier
 */
async function setupUserProfile(username: string, profile: any, notifier: INotifier): Promise<string> {
    const users = new Users();
    const wallet = new Wallet();

    notifier.start('Get user');
    const user = await users.getUser(username);
    notifier.completed();
    let did: string;
    if (user.role === UserRole.STANDARD_REGISTRY) {
        profile.entity = SchemaEntity.STANDARD_REGISTRY;
        did = await createUserProfile(profile, notifier, user);
    } else if (user.role === UserRole.USER) {
        profile.entity = SchemaEntity.USER;
        did = await createUserProfile(profile, notifier, user);
    } else {
        throw new Error('Unknow user role');
    }

    notifier.start('Update user');
    await users.updateCurrentUser(username, {
        did,
        parent: profile.parent,
        hederaAccountId: profile.hederaAccountId
    });
    notifier.completedAndStart('Set up wallet');
    await wallet.setKey(user.walletToken, KeyType.KEY, did, profile.hederaAccountKey);
    notifier.completed();

    return did;
}

/**
 * Create user profile
 * @param profile
 * @param notifier
 */
async function createUserProfile(
    profile: any,
    notifier: INotifier,
    user: IAuthUser
): Promise<string> {
    const logger = new Logger();
    const {
        hederaAccountId,
        hederaAccountKey,
        parent,
        vcDocument,
        didDocument,
        entity
    } = profile;
    const messageServer = new MessageServer(hederaAccountId, hederaAccountKey);

    // ------------------------
    // <-- Resolve topic
    // ------------------------
    notifier.start('Resolve topic');
    let topicConfig: TopicConfig = null;
    let newTopic: Topic = null;
    const globalTopic = await getGlobalTopic();
    if (parent) {
        topicConfig = await TopicConfig.fromObject(
            await new DataBaseHelper(Topic).findOne({
                owner: parent,
                type: TopicType.UserTopic
            }), true);
    }
    if (!topicConfig) {
        notifier.info('Create user topic');
        logger.info('Create User Topic', ['GUARDIAN_SERVICE']);
        const topicHelper = new TopicHelper(hederaAccountId, hederaAccountKey);
        topicConfig = await topicHelper.create({
            type: TopicType.UserTopic,
            name: TopicType.UserTopic,
            description: TopicType.UserTopic,
            owner: null,
            policyId: null,
            policyUUID: null
        });
        await topicHelper.oneWayLink(topicConfig, globalTopic, null);
        newTopic = await new DataBaseHelper(Topic).save(topicConfig.toObject());
    }
    messageServer.setTopicObject(topicConfig);
    // ------------------------
    // Resolve topic -->
    // ------------------------

    // ------------------------
    // <-- Publish DID Document
    // ------------------------
    notifier.completedAndStart('Publish DID Document');
    logger.info('Create DID Document', ['GUARDIAN_SERVICE']);

    const vcHelper = new VcHelper();
    const newDidDocument = await vcHelper.generateNewDid(topicConfig.topicId, hederaAccountKey);
    const userDID = newDidDocument.getDid();

    const existingUser = await new DataBaseHelper(DidDocumentCollection).findOne({ did: userDID });
    if (existingUser) {
        notifier.completedAndStart('User restored');
        notifier.completed();
        return userDID;
    }

    const didRow = await vcHelper.saveDidDocument(newDidDocument, user);

    try {
        const didMessage = new DIDMessage(MessageAction.CreateDID);
        didMessage.setDocument(newDidDocument);
        const didMessageResult = await messageServer
            .setTopicObject(topicConfig)
            .sendMessage(didMessage)
        didRow.status = DidDocumentStatus.CREATE;
        didRow.messageId = didMessageResult.getId();
        didRow.topicId = didMessageResult.getTopicId();
        await new DataBaseHelper(DidDocumentCollection).update(didRow);
    } catch (error) {
        logger.error(error, ['GUARDIAN_SERVICE']);
        didRow.status = DidDocumentStatus.FAILED;
        await new DataBaseHelper(DidDocumentCollection).update(didRow);
    }
    // ------------------------
    // Publish DID Document -->
    // ------------------------

    // ------------------
    // <-- Publish Schema
    // ------------------
    notifier.completedAndStart('Publish Schema');
    let schemaObject: Schema;
    try {
        let schema: SchemaCollection = null;

        schema = await new DataBaseHelper(SchemaCollection).findOne({
            entity: SchemaEntity.STANDARD_REGISTRY,
            readonly: true,
            topicId: topicConfig.topicId
        });
        if (!schema) {
            schema = await new DataBaseHelper(SchemaCollection).findOne({
                entity: SchemaEntity.STANDARD_REGISTRY,
                system: true,
                active: true
            });
            if (schema) {
                notifier.info('Publish System Schema (STANDARD_REGISTRY)');
                logger.info('Publish System Schema (STANDARD_REGISTRY)', ['GUARDIAN_SERVICE']);
                schema.creator = userDID;
                schema.owner = userDID;
                const item = await publishSystemSchema(schema, messageServer, MessageAction.PublishSystemSchema);
                await new DataBaseHelper(SchemaCollection).save(item);
            }
        }

        schema = await new DataBaseHelper(SchemaCollection).findOne({
            entity: SchemaEntity.USER,
            readonly: true,
            topicId: topicConfig.topicId
        });
        if (!schema) {
            schema = await new DataBaseHelper(SchemaCollection).findOne({
                entity: SchemaEntity.USER,
                system: true,
                active: true
            });
            if (schema) {
                notifier.info('Publish System Schema (USER)');
                logger.info('Publish System Schema (USER)', ['GUARDIAN_SERVICE']);
                schema.creator = userDID;
                schema.owner = userDID;
                const item = await publishSystemSchema(schema, messageServer, MessageAction.PublishSystemSchema);
                await new DataBaseHelper(SchemaCollection).save(item);
            }
        }

        schema = await new DataBaseHelper(SchemaCollection).findOne({
            entity: SchemaEntity.RETIRE_TOKEN,
            readonly: true,
            topicId: topicConfig.topicId,
        });
        if (!schema) {
            schema = await new DataBaseHelper(SchemaCollection).findOne({
                entity: SchemaEntity.RETIRE_TOKEN,
                system: true,
                active: true
            });
            if (schema) {
                notifier.info('Publish System Schema (RETIRE)');
                logger.info('Publish System Schema (RETIRE)', ['GUARDIAN_SERVICE']);
                schema.creator = userDID;
                schema.owner = userDID;
                const item = await publishSystemSchema(schema, messageServer, MessageAction.PublishSystemSchema);
                await new DataBaseHelper(SchemaCollection).save(item);
            }
        }

        if (entity) {
            schema = await new DataBaseHelper(SchemaCollection).findOne({
                entity,
                readonly: true,
                topicId: topicConfig.topicId
            });
            if (schema) {
                schemaObject = new Schema(schema);
            }
        }
    } catch (error) {
        logger.error(error, ['GUARDIAN_SERVICE']);
    }
    // ------------------
    // Publish Schema -->
    // ------------------

    // -----------------------
    // <-- Publish VC Document
    // -----------------------
    notifier.completedAndStart('Publish VC Document');
    if (vcDocument) {
        logger.info('Create VC Document', ['GUARDIAN_SERVICE']);

        let credentialSubject: any = { ...vcDocument } || {};
        credentialSubject.id = userDID;
        if (schemaObject) {
            credentialSubject = SchemaHelper.updateObjectContext(schemaObject, credentialSubject);
        }

        const vcObject = await vcHelper.createVerifiableCredential(credentialSubject, newDidDocument, null, null);
        const vcMessage = new VCMessage(MessageAction.CreateVC);
        vcMessage.setDocument(vcObject);
        const vcDoc = await new DataBaseHelper(VcDocumentCollection).save({
            hash: vcMessage.hash,
            owner: userDID,
            document: vcMessage.document,
            type: schemaObject?.entity
        });

        try {
            const vcMessageResult = await messageServer
                .setTopicObject(topicConfig)
                .sendMessage(vcMessage);
            vcDoc.hederaStatus = DocumentStatus.ISSUE;
            vcDoc.messageId = vcMessageResult.getId();
            vcDoc.topicId = vcMessageResult.getTopicId();
            await new DataBaseHelper(VcDocumentCollection).update(vcDoc);
        } catch (error) {
            logger.error(error, ['GUARDIAN_SERVICE']);
            vcDoc.hederaStatus = DocumentStatus.FAILED;
            await new DataBaseHelper(VcDocumentCollection).update(vcDoc);
        }
    }
    // -----------------------
    // Publish VC Document -->
    // -----------------------

    notifier.completedAndStart('Save changes');
    if (newTopic) {
        newTopic.owner = userDID;
        newTopic.parent = globalTopic?.topicId;
        await new DataBaseHelper(Topic).update(newTopic);
        topicConfig.owner = userDID;
        topicConfig.parent = globalTopic?.topicId;
        await topicConfig.saveKeysByUser(user);
    }

    if (globalTopic && newTopic) {
        const attributes = vcDocument ? { ...vcDocument } : {};
        delete attributes.type;
        delete attributes['@context'];
        const regMessage = new RegistrationMessage(MessageAction.Init);
        regMessage.setDocument(userDID, topicConfig?.topicId, attributes);
        await messageServer
            .setTopicObject(globalTopic)
            .sendMessage(regMessage)
    }

    notifier.completed();
    return userDID;
}

@Controller()
export class ProfileController {
}

/**
 * Connect to the message broker methods of working with Address books.
 */
export function profileAPI() {
    ApiResponse(MessageAPI.GET_BALANCE, async (msg) => {
        try {
            const { username } = msg;
            const wallet = new Wallet();
            const users = new Users();
            const workers = new Workers();
            const user = await users.getUser(username);

            if (!user) {
                return new MessageResponse(null);
            }

            if (!user.hederaAccountId) {
                return new MessageResponse(null);
            }

            const key = await wallet.getKey(user.walletToken, KeyType.KEY, user.did);
            const balance = await workers.addNonRetryableTask({
                type: WorkerTaskType.GET_USER_BALANCE,
                data: {
                    hederaAccountId: user.hederaAccountId,
                    hederaAccountKey: key
                }
            }, 20);
            return new MessageResponse({
                balance,
                unit: 'Hbar',
                user: user ? {
                    username: user.username,
                    did: user.did
                } : null
            });
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            console.error(error);
            return new MessageError(error, 500);
        }
    });

    ApiResponse(MessageAPI.GET_USER_BALANCE, async (msg) => {
        try {
            const { username } = msg;

            const wallet = new Wallet();
            const users = new Users();
            const workers = new Workers();

            const user = await users.getUser(username);

            if (!user) {
                return new MessageResponse('Invalid Account');
            }

            if (!user.hederaAccountId) {
                return new MessageResponse('Invalid Hedera Account Id');
            }

            const key = await wallet.getKey(user.walletToken, KeyType.KEY, user.did);
            const balance = await workers.addNonRetryableTask({
                type: WorkerTaskType.GET_USER_BALANCE,
                data: {
                    hederaAccountId: user.hederaAccountId,
                    hederaAccountKey: key
                }
            }, 20);

            return new MessageResponse(balance);
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            console.error(error);
            return new MessageError(error, 500);
        }
    });

    ApiResponse(MessageAPI.CREATE_USER_PROFILE_COMMON, async (msg) => {
        try {
            const { username, profile } = msg;

            if (!profile.hederaAccountId) {
                return new MessageError('Invalid Hedera Account Id', 403);
            }
            if (!profile.hederaAccountKey) {
                return new MessageError('Invalid Hedera Account Key', 403);
            }

            const did = await setupUserProfile(username, profile, emptyNotifier());
            return new MessageResponse(did);
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            console.error(error);
            return new MessageError(error, 500);
        }
    });

    ApiResponse(MessageAPI.CREATE_USER_PROFILE_COMMON_ASYNC, async (msg) => {
        const { username, profile, task } = msg;
        const notifier = await initNotifier(task);

        RunFunctionAsync(async () => {
            if (!profile.hederaAccountId) {
                notifier.error('Invalid Hedera Account Id');
                return;
            }
            if (!profile.hederaAccountKey) {
                notifier.error('Invalid Hedera Account Key');
                return;
            }

            const did = await setupUserProfile(username, profile, notifier);
            notifier.result(did);
        }, async (error) => {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            notifier.error(error);
        });

        return new MessageResponse(task);
    });

    ApiResponse(MessageAPI.RESTORE_USER_PROFILE_COMMON_ASYNC, async (msg) => {
        const { username, profile, task } = msg;
        const notifier = await initNotifier(task);

        RunFunctionAsync(async () => {
            if (!profile.hederaAccountId) {
                notifier.error('Invalid Hedera Account Id');
                return;
            }
            if (!profile.hederaAccountKey) {
                notifier.error('Invalid Hedera Account Key');
                return;
            }

            notifier.start('Restore user profile');
            const restore = new RestoreDataFromHedera();
            await restore.restoreRootAuthority(
                username,
                profile.hederaAccountId,
                profile.hederaAccountKey,
                profile.topicId
            )
            notifier.completed();
            notifier.result('did');
        }, async (error) => {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            notifier.error(error);
        });

        return new MessageResponse(task);
    });

    ApiResponse(MessageAPI.GET_ALL_USER_TOPICS_ASYNC, async (msg) => {
        const { username, profile, task } = msg;
        const notifier = await initNotifier(task);

        RunFunctionAsync(async () => {
            if (!profile.hederaAccountId) {
                notifier.error('Invalid Hedera Account Id');
                return;
            }
            if (!profile.hederaAccountKey) {
                notifier.error('Invalid Hedera Account Key');
                return;
            }

            notifier.start('Finding all user topics');
            const restore = new RestoreDataFromHedera();
            const result = await restore.findAllUserTopics(
                username,
                profile.hederaAccountId,
                profile.hederaAccountKey
            )
            notifier.completed();
            notifier.result(result);
        }, async (error) => {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            notifier.error(error);
        });

        return new MessageResponse(task);
    });

    ApiResponse(MessageAPI.VALIDATE_DID_DOCUMENT, async (msg) => {
        try {
            const { document } = msg;
            const result = {
                valid: true,
                error: '',
                keys: {}
            };
            try {
                const didDocument = CommonDidDocument.from(document);
                const methods = didDocument.getVerificationMethods();
                const ed25519 = [];
                const blsBbs = [];
                for (const method of methods) {
                    if (method.getType() === HederaEd25519Method.TYPE) {
                        ed25519.push({
                            name: method.getName(),
                            id: method.getId()
                        });
                    }
                    if (method.getType() === HederaBBSMethod.TYPE) {
                        blsBbs.push({
                            name: method.getName(),
                            id: method.getId()
                        });
                    }
                }
                result.keys[HederaEd25519Method.TYPE] = ed25519;
                result.keys[HederaBBSMethod.TYPE] = blsBbs;
                if (ed25519.length === 0) {
                    result.valid = false;
                    result.error = `${HederaEd25519Method.TYPE} method not found.`;
                }
                if (blsBbs.length === 0) {
                    result.valid = false;
                    result.error = `${HederaBBSMethod.TYPE} method not found.`;
                }
            } catch (error) {
                result.valid = false;
                result.error = 'Invalid DID Document.';
            }
            return new MessageResponse(result);
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            return new MessageError(error);
        }
    });

    ApiResponse(MessageAPI.VALIDATE_DID_KEY, async (msg) => {
        try {
            const { document, keys } = msg;
            for (const item of keys) {
                item.valid = false;
            }
            try {
                const helper = new VcHelper();
                const didDocument = CommonDidDocument.from(document);
                for (const item of keys) {
                    const method = didDocument.getMethodByName(item.id);
                    if (method) {
                        method.setPrivateKey(item.key);
                        item.valid = await helper.validateKey(method);
                    } else {
                        item.valid = false;
                    }
                }
                return new MessageResponse(keys);
            } catch (error) {
                return new MessageResponse(keys);
            }
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            return new MessageError(error);
        }
    });
}

@Module({
    imports: [
        ClientsModule.register([{
            name: 'profile-service',
            transport: Transport.NATS,
            options: {
                servers: [
                    `nats://${process.env.MQ_ADDRESS}:4222`
                ],
                queue: 'profile-service',
                // serializer: new OutboundResponseIdentitySerializer(),
                // deserializer: new InboundMessageIdentityDeserializer(),
            }
        }]),
    ],
    controllers: [
        ProfileController
    ]
})
export class ProfileModule { }
