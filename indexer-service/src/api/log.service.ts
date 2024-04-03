import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, } from '@nestjs/microservices';
import {
    IndexerMessageAPI,
    MessageResponse,
    MessageError,
    IPage,
    DataBaseHelper,
    MessageCache,
    DataBaseUtils,
    TopicCache,
    Message
} from '@indexer/common';

@Controller()
export class LogService {
    private async loadFile(filename: string): Promise<string> {
        try {
            const files = await DataBaseHelper.gridFS.find({ filename }).toArray();
            if (files.length === 0) {
                return null;
            }
            const file = files[0];
            const fileStream = DataBaseHelper.gridFS.openDownloadStream(file._id);
            const bufferArray = [];
            for await (const data of fileStream) {
                bufferArray.push(data);
            }
            const buffer = Buffer.concat(bufferArray);
            return buffer.toString();
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    /**
     * Get all messages
     * @param msg options
     * @returns messages
     */
    @MessagePattern(IndexerMessageAPI.GET_LOG_MESSAGES)
    async getAllMessages(
        @Payload()
        msg: {
            //page
            pageIndex: number;
            pageSize: number;
            //sort
            orderField?: string;
            orderDir?: string;
            //filters
            type?: string;
            status?: string;
        }
    ) {
        try {
            const { type, status, pageIndex, pageSize, orderField, orderDir } = msg;

            const filters: any = {};
            if (type) {
                filters.type = type;
            }
            if (status) {
                filters.status = status;
            }

            const em = DataBaseHelper.getEntityManager();
            const options = DataBaseUtils.pageParams(pageSize, pageIndex, 100, orderField, orderDir);
            const [rows, count] = await em.findAndCount(MessageCache, filters, options);

            const result: IPage<MessageCache> = {
                items: rows,
                pageIndex: pageIndex,
                pageSize: pageSize,
                total: count,
                order: options.orderBy
            }
            return new MessageResponse(result);
        } catch (error) {
            return new MessageError(error);
        }
    }


    /**
     * Get all topics
     * @param msg options
     * @returns topics
     */
    @MessagePattern(IndexerMessageAPI.GET_LOG_TOPICS)
    async getAllTopics(
        @Payload()
        msg: {
            //page
            pageIndex: number;
            pageSize: number;
            //sort
            orderField?: string;
            orderDir?: string;
            //filters
        }
    ) {
        try {
            const { pageIndex, pageSize, orderField, orderDir } = msg;

            const filters: any = {};
            const em = DataBaseHelper.getEntityManager();
            const options = DataBaseUtils.pageParams(pageSize, pageIndex, 100, orderField, orderDir);
            const [rows, count] = await em.findAndCount(TopicCache, filters, options);

            const result: IPage<TopicCache> = {
                items: rows,
                pageIndex: pageIndex,
                pageSize: pageSize,
                total: count,
                order: options.orderBy
            }
            return new MessageResponse(result);
        } catch (error) {
            return new MessageError(error);
        }
    }

    /**
     * Get all topics
     * @param msg options
     * @returns topics
     */
    @MessagePattern(IndexerMessageAPI.GET_LOG_DOCUMENTS)
    async getAllDocuments(
        @Payload()
        msg: {
            //page
            pageIndex: number;
            pageSize: number;
            //sort
            orderField?: string;
            orderDir?: string;
            //filters
            type?: string;
            status?: string;
            action?: string;
        }
    ) {
        try {
            const { type, status, action, pageIndex, pageSize, orderField, orderDir } = msg;

            const filters: any = {};
            if (type) {
                filters.type = type;
            }
            if (status) {
                filters.status = status;
            }
            if (action) {
                filters.action = action;
            }

            const em = DataBaseHelper.getEntityManager();
            const options = DataBaseUtils.pageParams(pageSize, pageIndex, 100, orderField, orderDir);
            const [rows, count] = await em.findAndCount(Message, filters, options);

            for (const row of rows) {
                row.documents = [];
                for (const fileName of row.files) {
                    const file = await this.loadFile(fileName);
                    row.documents.push(file);
                }
            }

            const result: IPage<Message> = {
                items: rows,
                pageIndex: pageIndex,
                pageSize: pageSize,
                total: count,
                order: options.orderBy
            }
            return new MessageResponse(result);
        } catch (error) {
            return new MessageError(error);
        }
    }

    /**
     * Get all topics
     * @param msg options
     * @returns topics
     */
    @MessagePattern(IndexerMessageAPI.GET_LOG_DOCUMENT_FILTERS)
    async getDocumentFilters() {
        try {
            const em = DataBaseHelper.getEntityManager();
            const status = await em.aggregate(Message, [{ $group: { _id: '$status' } }]);
            const action = await em.aggregate(Message, [{ $group: { _id: '$action' } }]);
            const type = await em.aggregate(Message, [{ $group: { _id: '$type' } }]);
            const result = {
                actions: action.map((row) => row._id),
                types: type.map((row) => row._id),
                statuses: status.map((row) => row._id)
            }
            return new MessageResponse(result);
        } catch (error) {
            return new MessageError(error);
        }
    }
}