import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import {
    FormBuilder,
    FormControl,
    FormGroup,
    Validators,
} from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { forkJoin } from 'rxjs';
import { ProfileService } from '../../services/profile.service';
import { SchemaService } from '../../services/schema.service';
import { IUser, Schema, SchemaEntity } from '@guardian/interfaces';
import { DemoService } from '../../services/demo.service';
import { VCViewerDialog } from '../../modules/schema-engine/vc-dialog/vc-dialog.component';
import { HeaderPropsService } from '../../services/header-props.service';
import { InformService } from '../../services/inform.service';
import { TasksService } from '../../services/tasks.service';
import { Router } from '@angular/router';
import { DialogService } from 'primeng/dynamicdialog';

enum OperationMode {
    None,
    Generate,
    GetAllUserTopics,
}

/**
 * Standard Registry profile settings page.
 */
@Component({
    selector: 'app-root-config',
    templateUrl: './root-config.component.html',
    styleUrls: ['./root-config.component.scss'],
})
export class RootConfigComponent implements OnInit {
    @ViewChild('actionMenu') actionMenu: any;

    public loading: boolean = true;
    public taskId: string | undefined = undefined;
    public isConfirmed: boolean = false;
    public profile: IUser | null;
    public balance: string | null;
    public errorLoadSchema: boolean = false;
    public isFailed: boolean = false;
    public isNewAccount: boolean = true;
    public progress: number = 0;
    public userTopics: any[] = [];
    public schema!: Schema;
    public hederaForm = this.fb.group({
        hederaAccountId: ['', Validators.required],
        hederaAccountKey: ['', Validators.required],
    });
    public selectedTokenId = new FormControl(null, Validators.required);
    public vcForm = new FormGroup({});
    public didDocumentForm = new FormControl(null, Validators.required);
    public didDocumentType = new FormControl(false, Validators.required);
    public didKeys: any[] = [];
    public didKeysControl = new FormGroup({});
    public hidePrivateFields = {
        id: true
    };
    public validVC: boolean = false;

    public step: 'HEDERA' | 'RESTORE' | 'DID' | 'DID_KEYS' | 'VC' = 'HEDERA';

    private operationMode: OperationMode = OperationMode.None;
    private expectedTaskMessages: number = 0;

    constructor(
        private router: Router,
        private auth: AuthService,
        private fb: FormBuilder,
        private profileService: ProfileService,
        private schemaService: SchemaService,
        private otherService: DemoService,
        private informService: InformService,
        private taskService: TasksService,
        private headerProps: HeaderPropsService,
        public dialog: DialogService,
        private cdRef: ChangeDetectorRef
    ) {
        this.profile = null;
        this.balance = null;
        this.vcForm.statusChanges.subscribe((result) => {
            setTimeout(() => {
                this.validVC = result == 'VALID';
            });
        });
    }

    ngOnInit() {
        this.loading = true;
        this.hederaForm.setValue({
            hederaAccountId: '',
            hederaAccountKey: ''
        });
        this.vcForm.setValue({});
        this.loadProfile();
    }

    ngOnDestroy(): void {
    }

    private loadProfile() {
        this.loading = true;
        this.profile = null;
        this.balance = null;

        forkJoin([
            this.profileService.getProfile(),
            this.profileService.getBalance(),
            this.schemaService.getSystemSchemasByEntity(SchemaEntity.STANDARD_REGISTRY)
        ]).subscribe(
            ([profile, balance, schema]) => {
                if (!schema) {
                    this.errorLoadSchema = true;
                    this.loading = false;
                    this.headerProps.setLoading(false);
                    return;
                }

                this.isConfirmed = !!profile.confirmed;
                this.isFailed = !!profile.failed;
                this.isNewAccount = !!!profile.didDocument;

                if (this.isConfirmed) {
                    this.balance = balance;
                    this.profile = profile;
                }

                if (schema) {
                    this.schema = new Schema(schema);
                }

                setTimeout(() => {
                    this.loading = false;
                    this.headerProps.setLoading(false);
                }, 500);
            },
            ({ message }) => {
                this.loading = false;
                this.headerProps.setLoading(false);
                console.error(message);
            }
        );
    }

    private prepareDataFrom(data: any) {
        if (Array.isArray(data)) {
            for (let j = 0; j < data.length; j++) {
                let dataArrayElem = data[j];
                if (dataArrayElem === '' || dataArrayElem === null) {
                    data.splice(j, 1);
                    j--;
                }
                if (
                    Object.getPrototypeOf(dataArrayElem) === Object.prototype ||
                    Array.isArray(dataArrayElem)
                ) {
                    this.prepareDataFrom(dataArrayElem);
                }
            }
        }

        if (Object.getPrototypeOf(data) === Object.prototype) {
            let dataKeys = Object.keys(data);
            for (let i = 0; i < dataKeys.length; i++) {
                const dataElem = data[dataKeys[i]];
                if (dataElem === '' || dataElem === null) {
                    delete data[dataKeys[i]];
                }
                if (
                    Object.getPrototypeOf(dataElem) === Object.prototype ||
                    Array.isArray(dataElem)
                ) {
                    this.prepareDataFrom(dataElem);
                }
            }
        }
    }

    private setErrors(form: FormControl | FormGroup, type?: string): void {
        const errors: any = {};
        errors[type || 'incorrect'] = true;
        form.setErrors(errors);
        form.markAsDirty();
        setTimeout(() => {
            form.setErrors(errors);
            form.markAsDirty();
        })
        // form.setValue('');
    }

    public parseDidDocument() {
        try {
            const json = this.didDocumentForm.value;
            const document = JSON.parse(json);
            this.loading = true;
            this.profileService
                .validateDID(document)
                .subscribe(
                    (result) => {
                        if (!result.valid) {
                            if (result.error === 'DID Document already exists.') {
                                this.setErrors(this.didDocumentForm, 'exists');
                            } else {
                                this.setErrors(this.didDocumentForm, 'incorrect');
                            }
                            this.loading = false;
                            return;
                        }
                        this.didKeys = [];
                        this.didKeysControl = new FormGroup({});
                        const names = Object.keys(result.keys);
                        for (const name of names) {
                            const keyNameControl = new FormControl('', [Validators.required]);
                            const keyValueControl = new FormControl('', [Validators.required]);
                            const keyControl = new FormGroup({
                                name: keyNameControl,
                                value: keyValueControl
                            }, [Validators.required]);
                            this.didKeysControl.addControl(name, keyControl);
                            this.didKeys.push({
                                name,
                                keyNameControl,
                                keyValueControl,
                                keyNames: result.keys[name]
                            })
                        }
                        this.onNextStep('DID_KEYS');
                        this.loading = false;
                    },
                    (e) => {
                        this.setErrors(this.didDocumentForm, 'incorrect');
                    }
                );
        } catch (error) {
            this.setErrors(this.didDocumentForm, 'incorrect');
        }
    }

    public parseDidKeys() {
        try {
            const json = this.didDocumentForm.value;
            const document = JSON.parse(json);
            const keys: any[] = [];
            for (const didKey of this.didKeys) {
                keys.push({
                    id: didKey.keyNameControl.value,
                    key: didKey.keyValueControl.value
                })
            }
            this.loading = true;
            this.profileService
                .validateDIDKeys(document, keys)
                .subscribe(
                    (result) => {
                        let valid = true;
                        if (Array.isArray(result)) {
                            for (const didKey of this.didKeys) {
                                const item = result.find(k => k.id === didKey.keyNameControl.value);
                                if (!item || !item.valid) {
                                    this.setErrors(didKey.keyValueControl, 'incorrect');
                                    valid = false;
                                }
                            }
                        } else {
                            for (const didKey of this.didKeys) {
                                this.setErrors(didKey.keyValueControl, 'incorrect');
                                valid = false;
                            }
                        }
                        if (valid) {
                            this.onNextStep('VC')
                        } else {
                            this.setErrors(this.didKeysControl, 'incorrect');
                        }
                        this.cdRef.detectChanges();
                        this.loading = false;
                    },
                    (e) => {
                        this.setErrors(this.didKeysControl, 'incorrect');
                    }
                );
        } catch (error) {
            this.setErrors(this.didKeysControl, 'incorrect');
        }
    }

    public onRestore() {
        const value = this.hederaForm.value;
        const topicId = this.selectedTokenId.value;
        this.loading = true;
        this.headerProps.setLoading(true);
        this.profileService
            .restoreProfile({
                hederaAccountId: value.hederaAccountId?.trim(),
                hederaAccountKey: value.hederaAccountKey?.trim(),
                topicId,
            })
            .subscribe(
                (result) => {
                    const { taskId, expectation } = result;
                    this.router.navigate(['task', taskId], {
                        queryParams: {
                            last: btoa(location.href),
                        },
                    });
                },
                (e) => {
                    this.loading = false;
                    this.taskId = undefined;
                }
            );
    }

    public onPrevStep(step: 'HEDERA' | 'RESTORE' | 'DID' | 'DID_KEYS' | 'VC') {
        this.step = step;
    }

    public onNextStep(step: 'HEDERA' | 'RESTORE' | 'DID' | 'DID_KEYS' | 'VC') {
        switch (this.step) {
            case 'HEDERA':
                if (!this.hederaForm.valid) {
                    return;
                }
                break;
            case 'RESTORE':
                if (!this.hederaForm.valid || !this.selectedTokenId.valid) {
                    return;
                }
                break;
            case 'DID':
                if (this.didDocumentType.value && !this.didDocumentForm.valid) {
                    return;
                }
                break;
            case 'DID_KEYS':
                if (!this.didKeysControl.valid) {
                    return;
                }
                break;
            case 'VC':
                if (!this.validVC) {
                    return;
                }
                break;
        }
        this.step = step;
    }

    public onChangeDidType() {
        this.didDocumentForm.reset();
    }

    public onChangeForm() {
        this.vcForm.updateValueAndValidity();
    }

    public onAsyncError(error: any) {
        this.informService.processAsyncError(error);
        this.loading = false;
        this.taskId = undefined;
    }

    public onAsyncCompleted() {
        if (this.taskId) {
            const taskId = this.taskId;
            const operationMode = this.operationMode;
            this.taskId = undefined;
            this.operationMode = OperationMode.None;
            this.taskService.get(taskId).subscribe(
                (task) => {
                    switch (operationMode) {
                        case OperationMode.Generate: {
                            const { id, key } = task.result;
                            this.hederaForm.setValue({
                                hederaAccountId: id,
                                hederaAccountKey: key,
                            });
                            this.loading = false;
                            break;
                        }
                        case OperationMode.GetAllUserTopics: {
                            this.userTopics = task.result
                                .sort((a: any, b: any) => {
                                    return b.timestamp - a.timestamp;
                                })
                                .map((i: any) => {
                                    return {
                                        topicId: i.topicId,
                                        date: new Date(
                                            i.timestamp
                                        ).toLocaleString(),
                                    };
                                });
                            this.loadProfile();
                            this.selectedTokenId.setValue(
                                this.userTopics && this.userTopics.length
                                    ? this.userTopics[0].topicId
                                    : undefined
                            );
                            break;
                        }
                    }
                },
                (e) => {
                    this.loading = false;
                }
            );
        }
    }

    public randomKey() {
        this.loading = true;
        this.otherService.pushGetRandomKey().subscribe(
            (result) => {
                const { taskId, expectation } = result;
                this.taskId = taskId;
                this.expectedTaskMessages = expectation;
                this.operationMode = OperationMode.Generate;
            },
            (e) => {
                this.loading = false;
                this.taskId = undefined;
            }
        );
    }

    public getAllUserTopics(event: any) {
        event.stopPropagation();
        event.preventDefault();
        if (this.hederaForm.invalid) {
            return;
        }

        const value = this.hederaForm.value;
        const profile = {
            hederaAccountId: value.hederaAccountId?.trim(),
            hederaAccountKey: value.hederaAccountKey?.trim(),
        };
        this.loading = true;
        this.profileService.getAllUserTopics(profile).subscribe(
            (result) => {
                const { taskId, expectation } = result;
                this.taskId = taskId;
                this.expectedTaskMessages = expectation;
                this.operationMode = OperationMode.GetAllUserTopics;
            },
            (e) => {
                this.loading = false;
                this.taskId = undefined;
            }
        );
    }

    public retry() {
        this.isConfirmed = false;
        this.isFailed = false;
        this.isNewAccount = true;
    }

    public onSubmit() {
        if (this.hederaForm.valid && this.vcForm.valid) {
            const hederaForm = this.hederaForm.value;
            const vcDocument = this.vcForm.value;
            const didDocument = this.didDocumentType.value ?
                this.didDocumentForm.value : null;

            this.prepareDataFrom(vcDocument);
            const data: any = {
                hederaAccountId: hederaForm.hederaAccountId?.trim(),
                hederaAccountKey: hederaForm.hederaAccountKey?.trim(),
                vcDocument: vcDocument,
                didDocument: didDocument
            };
            this.loading = true;
            this.headerProps.setLoading(true);
            this.profileService.pushSetProfile(data).subscribe(
                (result) => {
                    const { taskId, expectation } = result;
                    this.router.navigate(['task', taskId], {
                        queryParams: {
                            last: btoa(location.href),
                        },
                    });
                },
                ({ message }) => {
                    this.loading = false;
                    this.headerProps.setLoading(false);
                    console.error(message);
                }
            );
        }
    }

    public openVCDocument(document: any, title: string) {
        const dialogRef = this.dialog.open(VCViewerDialog, {
            width: '65vw',
            closable: true,
            header: 'VC',
            data: {
                id: document.id,
                dryRun: !!document.dryRunId,
                document: document.document,
                title,
                type: 'VC',
                viewDocument: true,
            },
        });
        dialogRef.onClose.subscribe(async (result) => {
        });
    }

    public openDIDDocument(document: any, title: string) {
        const dialogRef = this.dialog.open(VCViewerDialog, {
            width: '65vw',
            closable: true,
            header: 'DID',
            data: {
                id: document.id,
                dryRun: !!document.dryRunId,
                document: document.document,
                title,
                type: 'JSON',
            },
        });

        dialogRef.onClose.subscribe(async (result) => {
        });
    }
}
