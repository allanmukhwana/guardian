import { VcDocument, VpDocument } from '@guardian/common';
import { ICompareOptions } from '../interfaces/compare-options.interface';
import { IWeightModel } from '../interfaces/weight-model.interface';
import { IKeyMap } from '../interfaces/key-map.interface';
import { WeightType } from '../types/weight.type';
import { CompareUtils } from '../utils/utils';
import { SchemaModel } from './schema.model';
import { DocumentFieldsModel } from './document-fields.model';
import { PropertyModel } from './property.model';
import { HashUtils } from '../utils/hash-utils';
import { PropertiesModel } from './properties.model';
import { DocumentModel } from './document.model';

/**
 * Document Model
 */
export class RecordModel implements IWeightModel {
    /**
     * Compare Options
     * @public
     */
    public readonly options: ICompareOptions;

    /**
     * All children
     * @protected
     */
    protected _children: DocumentModel[];

    /**
     * Weights
     * @protected
     */
    protected _weight: string[];

    /**
     * Weights map by name
     * @protected
     */
    protected _weightMap: IKeyMap<string>;

    /**
     * Weights
     * @protected
     */
    protected _key: string;

    /**
     * Hash
     * @private
     */
    private _hash: string;

    /**
     * Children
     * @public
     */
    public get children(): DocumentModel[] {
        return this._children;
    }

    /**
     * Model key
     * @public
     */
    public get key(): string {
        return this._key;
    }


    constructor(
        options: ICompareOptions
    ) {
        this.options = options;

        this._weight = [];
        this._weightMap = {};
        this._hash = '';
    }

    /**
     * Set relationship models
     * @param children
     * @public
     */
    public setChildren(children: DocumentModel[]): RecordModel {
        if (Array.isArray(children)) {
            this._children = children;
        } else {
            this._children = [];
        }
        return this;
    }

    /**
     * Update all weight
     * @public
     */
    public update(options: ICompareOptions): RecordModel {
        const weights = [];
        const weightMap = {};
        this._hash = ''
        this._weightMap = weightMap;
        this._weight = weights.reverse();
        return this;
    }

    /**
     * Compare weight
     * @param doc
     * @param index
     * @param schema
     * @private
     */
    private compareWeight(doc: RecordModel, index: number): boolean {
        return this._weight[index] === doc._weight[index] && this._weight[index] !== '0';
    }

    /**
     * Get weight by name
     * @param type - weight name
     * @public
     */
    public getWeight(type?: WeightType): string {
        if (type) {
            return this._weightMap[type];
        } else {
            return this._weight[0];
        }
    }

    /**
     * Check weight by number
     * @param index - weight index
     * @public
     */
    public checkWeight(index: number): boolean {
        return index < this._weight.length;
    }

    /**
     * Get all weight
     * @public
     */
    public getWeights(): string[] {
        return this._weight;
    }

    /**
     * Get weight number
     * @public
     */
    public maxWeight(): number {
        return this._weight ? this._weight.length : 0;
    }

    /**
     * Comparison of models using weight
     * @param item - model
     * @param index - weight index
     * @public
     */
    public equal(doc: RecordModel, index?: number): boolean {
        if (!this._weight.length) {
            return this._hash === doc._hash;
        }

        if (!Number.isFinite(index)) {
            return this._hash === doc._hash;
        }

        return this.compareWeight(doc, index);
    }

    /**
     * Comparison of models using key
     * @param item - model
     * @public
     */
    public equalKey(doc: RecordModel): boolean {
        return true;
    }

    /**
     * Convert class to object
     * @public
     */
    public toObject(): any {
        return {
        }
    }

    /**
     * Convert class to object
     * @public
     */
    public info(): any {
        return {
        };
    }
}