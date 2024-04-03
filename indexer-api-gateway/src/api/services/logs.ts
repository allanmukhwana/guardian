import { Body, Controller, HttpCode, HttpException, HttpStatus, Get, Param, Inject, Query } from '@nestjs/common';
import { ClientProxy, EventPattern, MessagePattern } from '@nestjs/microservices';
import { InternalServerErrorDTO, PageDTO } from '../../middlewares/validation/schemas/index.js';
import {
    ApiInternalServerErrorResponse,
    ApiUnauthorizedResponse,
    ApiForbiddenResponse,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiSecurity,
    ApiTags,
    ApiQuery
} from '@nestjs/swagger';
import { ApiImplicitParam } from '@nestjs/swagger/dist/decorators/api-implicit-param.decorator.js';
import { firstValueFrom, timeout } from 'rxjs';
import { AnyResponse, IPage, IndexerMessageAPI, responseFrom } from '@indexer/common';

@Controller('logs')
@ApiTags('logs')
export class LogsApi {
    constructor(@Inject('INDEXER_API') private readonly client: ClientProxy) {
    }

    private async send<T>(api: IndexerMessageAPI, body: any): Promise<T> {
        const result = await firstValueFrom(this.client.send<AnyResponse<T>>(api, body));
        return responseFrom(result);
    }

    /**
     * Get
     */
    @Get('/messages')
    @ApiOperation({
        summary: '.',
        description: '.'
    })
    @ApiQuery({
        name: 'type',
        description: 'Document type.',
        type: String,
        example: 'type'
    })
    @ApiQuery({
        name: 'status',
        description: 'Document status.',
        type: String,
        example: 'status'
    })
    @ApiQuery({
        name: 'pageIndex',
        description: 'Page index.',
        type: Number,
        example: 0
    })
    @ApiQuery({
        name: 'pageSize',
        description: 'Page size.',
        type: Number,
        example: 20
    })
    @ApiQuery({
        name: 'orderField',
        description: 'Order field.',
        type: String,
        example: 'topicId'
    })
    @ApiQuery({
        name: 'orderDir',
        description: 'Order direction.',
        type: String,
        example: 'DESC'
    })
    @ApiOkResponse({
        description: 'Successful operation.',
        type: PageDTO
    })
    @ApiForbiddenResponse({
        description: 'Forbidden.',
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error.',
        type: InternalServerErrorDTO
    })
    @HttpCode(HttpStatus.OK)
    async getAllMessages(
        @Query('type') type?: string,
        @Query('status') status?: string,
        @Query('pageIndex') pageIndex?: number,
        @Query('pageSize') pageSize?: number,
        @Query('orderField') orderField?: string,
        @Query('orderDir') orderDir?: string,

    ): Promise<any> {
        return await this.send<IPage<any>>(IndexerMessageAPI.GET_LOG_MESSAGES,
            {
                type,
                status,
                pageIndex,
                pageSize,
                orderField,
                orderDir
            }
        );
    }

    /**
     * Get
     */
    @Get('/topics')
    @ApiOperation({
        summary: '.',
        description: '.'
    })
    @ApiQuery({
        name: 'pageIndex',
        description: 'Page index.',
        type: Number,
        example: 0
    })
    @ApiQuery({
        name: 'pageSize',
        description: 'Page size.',
        type: Number,
        example: 20
    })
    @ApiQuery({
        name: 'orderField',
        description: 'Order field.',
        type: String,
        example: 'topicId'
    })
    @ApiQuery({
        name: 'orderDir',
        description: 'Order direction.',
        type: String,
        example: 'DESC'
    })
    @ApiOkResponse({
        description: 'Successful operation.',
        type: PageDTO
    })
    @ApiForbiddenResponse({
        description: 'Forbidden.',
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error.',
        type: InternalServerErrorDTO
    })
    @HttpCode(HttpStatus.OK)
    async getAllTopics(
        @Query('pageIndex') pageIndex?: number,
        @Query('pageSize') pageSize?: number,
        @Query('orderField') orderField?: string,
        @Query('orderDir') orderDir?: string,

    ): Promise<any> {
        return await this.send<IPage<any>>(IndexerMessageAPI.GET_LOG_TOPICS,
            {
                pageIndex,
                pageSize,
                orderField,
                orderDir
            }
        );
    }

    /**
     * Get
     */
    @Get('/documents')
    @ApiOperation({
        summary: '.',
        description: '.'
    })
    @ApiQuery({
        name: 'pageIndex',
        description: 'Page index.',
        type: Number,
        example: 0
    })
    @ApiQuery({
        name: 'pageSize',
        description: 'Page size.',
        type: Number,
        example: 20
    })
    @ApiQuery({
        name: 'orderField',
        description: 'Order field.',
        type: String,
        example: 'topicId'
    })
    @ApiQuery({
        name: 'orderDir',
        description: 'Order direction.',
        type: String,
        example: 'DESC'
    })
    @ApiOkResponse({
        description: 'Successful operation.',
        type: PageDTO
    })
    @ApiForbiddenResponse({
        description: 'Forbidden.',
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error.',
        type: InternalServerErrorDTO
    })
    @HttpCode(HttpStatus.OK)
    async getAllDocuments(
        @Query('type') type?: string,
        @Query('status') status?: string,
        @Query('action') action?: string,
        @Query('pageIndex') pageIndex?: number,
        @Query('pageSize') pageSize?: number,
        @Query('orderField') orderField?: string,
        @Query('orderDir') orderDir?: string,

    ): Promise<any> {
        return await this.send<IPage<any>>(IndexerMessageAPI.GET_LOG_DOCUMENTS,
            {
                type,
                status,
                action,
                pageIndex,
                pageSize,
                orderField,
                orderDir
            }
        );
    }

    /**
     * Get
     */
    @Get('/documents/filters')
    @ApiOperation({
        summary: '.',
        description: '.'
    })
    @ApiOkResponse({
        description: 'Successful operation.',
        type: PageDTO
    })
    @ApiForbiddenResponse({
        description: 'Forbidden.',
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error.',
        type: InternalServerErrorDTO
    })
    @HttpCode(HttpStatus.OK)
    async getDocumentFilters(): Promise<any> {
        return await this.send<IPage<any>>(IndexerMessageAPI.GET_LOG_DOCUMENT_FILTERS, {});
    }
}