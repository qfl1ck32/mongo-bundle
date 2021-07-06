import { Collection } from "./models/Collection";
import {
  IAstToQueryOptions,
  ILinkCollectionOptions,
  QueryBodyType,
} from "@kaviar/nova";
import { ValidateOptions } from "@kaviar/validator-bundle";
import { ContainerInstance, Constructor } from "@kaviar/core";

export type BehaviorType = (collectionEventManager: Collection<any>) => void;

declare module "@kaviar/nova" {
  export interface IQueryContext {
    container: ContainerInstance;
  }
}

export interface IExecutionContext {
  /**
   * This userId is needed for blamable behaviors. You can omit it if it's done by the system
   */
  userId?: any;
  [key: string]: any;
}

export interface IContextAware {
  context?: IExecutionContext;
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
  /**
   * Enabling this will check if `userId` is not undefined, if it is it will throw an error, userId can still be `null` because the system does the operation (in a cronjob for example)
   * You can regard it as a safety net to avoid mistakes.
   */
  throwErrorWhenMissing?: boolean;
}

export interface ISoftdeletableBehaviorOptions {
  fields?: {
    isDeleted?: string;
    deletedAt?: string;
    deletedBy?: string;
  };
}

export interface IBundleLinkCollectionOption
  extends Omit<ILinkCollectionOptions, "collection"> {
  collection: (container: ContainerInstance) => Constructor<Collection>;
}

export interface IBundleLinkOptions {
  [key: string]: IBundleLinkCollectionOption;
}

export interface IGetFieldsResponse {
  all: string[];
  top: string[];
}
