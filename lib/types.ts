import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { z } from "zod";

export type AuthParams = {
  email: boolean;
  //   google: {
  //     clientId: string;
  //     clientSecret: string;
  //   };
  //   facebook: {};
  //   oidc: {}; // Auth0, Okta, etc.
  //   passwordless: {}; // SMS, email, etc.
};

export type ApiHttpResourceKeys = "put" | "post" | "get" | "delete";

export type ApiProxyResourceKeys = "proxy";

export type ApiResourceAuthParams = apigateway.Authorizer | false;

export type ApiResourceAuthParamsHost = {
  auth: ApiResourceAuthParams;
  request: z.ZodObject<any>;
  responses: z.ZodObject<any> | { statusCode: number; schema: z.ZodObject<any> }[];
};

export type WithOptionalResourceAuthParams<T> = T & Partial<ApiResourceAuthParamsHost>;

export type ApiResourceLambdaDefinition = WithOptionalResourceAuthParams<
  apigateway.LambdaIntegrationOptions & { function: lambda.IFunction; queryParams?: Record<string, boolean> }
>;

export type ApiResourceIntegrationDefinition =
  | apigateway.Integration
  | WithOptionalResourceAuthParams<{ integration: apigateway.Integration }>;

export type ApiResourceDefinition = ApiResourceIntegrationDefinition | ApiResourceLambdaDefinition;

// For proxy integration we can define extensive set of params allowing to define and override the default integration
// https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway-readme.html#aws-lambda-backed-apis
export type ApiProxyResourceParams = Record<ApiProxyResourceKeys, ApiResourceDefinition>;
export type ApiHttpResourceParams = Record<ApiHttpResourceKeys, ApiResourceDefinition>;

// @TODO: can we add metadata to a resource?
// Metadata could be used to pass something to the authorizer
export type ApiResourceParams = Partial<ApiHttpResourceParams> | Partial<ApiProxyResourceParams>;

export type ApiParams = {
  globalParams?: Partial<{
    auth: ApiResourceAuthParams;
    cors: apigateway.CorsOptions;
    // @TODO: add global transformers for parsing query string, URL params and body
  }>;
  paths: Record<string, ApiResourceParams>;
};


