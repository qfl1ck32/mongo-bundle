import { Collection } from "./models/Collection";
import { ILinkCollectionOptions } from "@kaviar/nova";
import { ValidateOptions } from "@kaviar/validator-bundle";

export type BehaviorType = (collectionEventManager: Collection<any>) => void;

export interface IContextAware {
  context?: any;
}

export interface ITimestampableBehaviorOptions {
  fields?: {
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface IValidateBehaviorOptions {
  model: any;
  options?: ValidateOptions;
  cast?: boolean;
  castOptions?: any;
}

export interface IBlameableBehaviorOptions {
  fields?: {
    updatedBy?: string;
    createdBy?: string;
  };
}

export interface ISoftdeletableBehaviorOptions {
  fields?: {
    isDeleted?: string;
    deletedAt?: string;
    deletedBy?: string;
  };
}

type Modify<T, R> = Omit<T, keyof R> & R;

export interface IBundleLinkCollectionOption
  extends Omit<ILinkCollectionOptions, "collection"> {
  collection: () => { new (...args: any[]): Collection<any> };
}

export interface IBundleLinkOptions {
  [key: string]: IBundleLinkCollectionOption;
}

export interface IGetFieldsResponse {
  all: string[];
  top: string[];
}
