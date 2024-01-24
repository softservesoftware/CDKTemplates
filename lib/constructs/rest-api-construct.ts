import {
  Authorizer,
  IResource,
  Integration,
  LambdaIntegration,
  LambdaIntegrationOptions,
  MethodOptions,
  Model,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { z } from "zod";
import {
  ApiHttpResourceKeys,
  ApiHttpResourceParams,
  ApiParams,
  ApiProxyResourceParams,
  ApiResourceDefinition,
  ApiResourceIntegrationDefinition,
  ApiResourceLambdaDefinition,
  ApiResourceParams,
} from "../types";
import { convertZodSchemaToApiGatewayModel } from "../utils/validation";

const getPathSegmentsFromFullPath = (fullPath: string): string[] =>
  fullPath
    .split("/")
    .map((segment) => String(segment).trim())
    .filter(Boolean);

const ensurePathIdentifier = (path: string): string => (path.startsWith("/") ? path.slice(1) : path);

const getIntegrationFromResourceDefinition = (
  definition: ApiResourceDefinition,
  options: { pathParams: string[] } | { skipRequestTemplateCreation: true },
): Integration => {
  const integrationDefinition = definition as ApiResourceIntegrationDefinition;
  if (integrationDefinition instanceof Integration) {
    return integrationDefinition;
  }

  if (integrationDefinition.integration instanceof Integration) {
    return integrationDefinition.integration;
  }

  const lambdaDefinition = definition as ApiResourceLambdaDefinition;
  if (lambdaDefinition.function instanceof lambda.Function) {
    const { function: lambdaFunction, queryParams, ...rest } = lambdaDefinition;
    let integrationOptions: LambdaIntegrationOptions = rest;

    if ("pathParams" in options && options.pathParams) {
      // It can be used to implement URL and querystring parameters renaming
      const requestParametersDef = Object.fromEntries([
        ...options.pathParams.map((param) => [`integration.request.path.${param}`, `method.request.path.${param}`]),
        ...Object.entries(queryParams || {}).map(([param]) => [
          `integration.request.querystring.${param}`,
          `method.request.querystring.${param}`,
        ]),
      ]);
      const requestTemplateParsamsDef = Object.fromEntries(
        options.pathParams.map((param) => [param, `$input.params().path.get('${param}')`]),
      );
      const requestTemplateQueryParamsDef = Object.fromEntries(
        Object.entries(queryParams || {}).map(([key]) => [key, `$input.params().querystring.get('${key}')`]),
      );

      integrationOptions = {
        ...integrationOptions,
        requestParameters: requestParametersDef,
        requestTemplates: {
          "application/json": JSON.stringify({
            params: requestTemplateParsamsDef,
            query: requestTemplateQueryParamsDef,
            body: '$input.json("$")',
          }),
        },
      };
    }

    return new LambdaIntegration(lambdaFunction, integrationOptions);
  }

  console.error("Invalid resource definition", definition);

  throw new Error("Invalid resource definition");
};

const isProxyResourceDef = (value: ApiResourceParams): value is ApiProxyResourceParams =>
  "proxy" in value && Boolean(value.proxy);

const toPascalCase = (str: string): string => str[0].toUpperCase() + str.slice(1).toLowerCase();

const stringToAlphanumericName = (path: string): string =>
  path
    .replace(/[^a-zA-Z0-9]/g, "-")
    .split("-")
    .filter(Boolean)
    .map(toPascalCase)
    .join("");

const buildNamespacedNameCreator =
  (options: { path: string; method: string }) =>
  (name: string): string =>
    [options.method, options.path, name].map(stringToAlphanumericName).join("");

export class RestApiConstruct extends Construct {
  public readonly api: RestApi;

  constructor(scope: Construct, id: string, params: ApiParams) {
    super(scope, id);

    // @TODO: add namespace usage
    // @TODO: add necessary API params like deployment stage, etc.
    const restApi = new RestApi(this, "RestApi", {
      restApiName: id,
      deployOptions: {
        stageName: "dev",
      },
      retainDeployments: true,
      // defaultMethodOptions: {
      //   authorizer: params.globalParams?.auth,
      // }
    });

    this.api = restApi;

    for (const [fullPath, resourceDef] of Object.entries(params.paths)) {
      const pathSegments = getPathSegmentsFromFullPath(fullPath);
      const leafResource = pathSegments
        .map(ensurePathIdentifier)
        .reduce((resource: IResource, pathSegment: string): IResource => {
          const childResource = resource.getResource(pathSegment);

          if (!childResource) {
            return resource.addResource(pathSegment);
          }

          return childResource;
        }, restApi.root);

      if (isProxyResourceDef(resourceDef)) {
        const proxyDef: ApiResourceDefinition = resourceDef.proxy;

        leafResource.addProxy({
          defaultIntegration: getIntegrationFromResourceDefinition(proxyDef, {
            skipRequestTemplateCreation: true,
          }),
        });
      } else {
        const httpMethods: Array<ApiHttpResourceKeys> = ["get", "post", "put", "delete"];
        const pathParams = pathSegments
          .filter((segment) => segment.startsWith("{") && segment.endsWith("}"))
          .map((segment) => segment.slice(1, -1));

        const requestParametersDef = Object.fromEntries(
          pathParams.map((param) => [`method.request.path.${param}`, true]),
        );

        for (const method of httpMethods) {
          const httpResourceDef = resourceDef as Partial<ApiHttpResourceParams>;
          const methodDef: ApiResourceDefinition | undefined = httpResourceDef[method];
          if (!methodDef) {
            continue;
          }

          const createName = buildNamespacedNameCreator({ path: fullPath, method });

          const requestParamsQueryStringParamsDef =
            "queryParams" in methodDef && methodDef.queryParams
              ? Object.fromEntries(
                  Object.entries(methodDef.queryParams).map(([param, value]) => [
                    `method.request.querystring.${param}`,
                    value,
                  ]),
                )
              : {};

          if (params.globalParams?.cors) {
            leafResource.addCorsPreflight(params.globalParams.cors);
          }

          // @TODO: add authorizer creation
          const integration = getIntegrationFromResourceDefinition(methodDef, {
            pathParams,
          });

          leafResource.addMethod(method.toUpperCase(), integration, {
            requestValidatorOptions: {
              requestValidatorName: createName("Request-Validator"),
              validateRequestBody: true,
              // @TODO: add ability to disable validation of path and query string params
              validateRequestParameters: true,
            },
            requestParameters: {
              ...requestParametersDef,
              ...requestParamsQueryStringParamsDef,
            },
            requestModels:
              "request" in methodDef && methodDef.request
                ? {
                    "application/json": this.addModelFromZodSchema(createName("Request-Model"), methodDef.request),
                  }
                : undefined,
            methodResponses:
              "responses" in methodDef && methodDef.responses
                ? (Array.isArray(methodDef.responses)
                    ? methodDef.responses
                    : [{ statusCode: 200, schema: methodDef.responses }]
                  ).map((response) => ({
                    statusCode: String(response.statusCode),
                    responseModels: {
                      "application/json": this.addModelFromZodSchema(createName("Response-Model"), response.schema),
                    },
                  }))
                : undefined,

            ...this.createMethodAuthDef({
              globalAuthorizer: params.globalParams?.auth,
              methodDef,
            }),
          });
        }
      }
    }
  }

  protected addModelFromZodSchema(name: string, schema: z.ZodObject<any>): Model {
    // console.log(JSON.stringify(zodToJsonSchema(schema), null, 2));

    const jsonSchema = convertZodSchemaToApiGatewayModel(schema);

    // console.log(JSON.stringify(jsonSchema, null, 2));

    return this.api.addModel(name, {
      modelName: name,
      contentType: "application/json",
      schema: jsonSchema,
      // schema: zodToJsonSchema(schema) as JsonSchema,
    });
  }

  protected createMethodAuthDef(params: {
    globalAuthorizer: Authorizer | undefined;
    methodDef: ApiResourceDefinition;
  }): Pick<MethodOptions, 'authorizer' | 'authorizationScopes'> | null {
    if (params.methodDef instanceof Integration) {
      return {
        authorizer: params.globalAuthorizer,
      };
    }

    const isAuthDisabled = params.methodDef.auth === false;
    if (isAuthDisabled) {
      return null;
    }

    let authorizer: Authorizer | undefined = params.globalAuthorizer;

    if (params.methodDef.auth && typeof params.methodDef.auth === "object") {
      authorizer = params.methodDef.auth;
    }

    return {
      authorizer,
      authorizationScopes: params.methodDef.authorizationScopes,
    };
  }
}
