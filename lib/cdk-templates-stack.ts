import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { z } from "zod";
import { RestApiConstruct } from "./constructs/rest-api-construct";
import { CognitoAuth } from "./constructs/cognito-auth-construct";
import templateLambdaFactory from "../lambdas/template-lambda/infra";
import { PaymentsPermissions } from "../types";

/**
 * @TODO:
 * - add endpoints specification with various integrations
 *     - [x] add parsing of path, query and body parameters
 *     - [x] add various integrations (done at the base level)
 *     - add cors
 *     - [x] add proxy integrations
 *     - add authorizers
 *     - add rate limiting and throttling
 * - add global params
 *    - [x] add global cors
 *    - add global authorizers
 *    - add integration timeout specification
 * - add deployments and stages
 * - add custom domain
 * - [x] add request/response models and validators
 */

enum Permissions {
  READ = "read",
  WRITE = "write",
}

enum Bits {
  BIT_1 = 1,
  BIT_2 = 2,
  BIT_4 = 4,
  BIT_8 = 8,
}

enum ApiServerScopes {
  USERS_READ = "users:read",
}

export class CdkTemplatesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const cognitoAuth = new CognitoAuth(this, "AuthManager", {
      signUpEnabled: true,
      email: true,
    });
    const apiServer = cognitoAuth.addResourceServer("ApiServer", {
      scopes: [ApiServerScopes.USERS_READ, PaymentsPermissions.CREATE_PAYMENT],
    });
    const clientApp = cognitoAuth.addClientApp("ClientApp", {
      api: { resourceServer: apiServer, scopes: [PaymentsPermissions.CREATE_PAYMENT] },
      callbackUrls: ["https://localhost"],
      logoutUrls: ["https://localhost"],
    });
    const domain = cognitoAuth.addCognitoDomain("cdk-templates-willie");
    const signInUrl = domain.signInUrl(clientApp, {
      redirectUri: "http://localhost",
    });

    new cdk.CfnOutput(this, "SignInUrl", {
      exportName: "SignInUrl",
      value: signInUrl,
    });

    const fooBarLambda = new lambda.Function(this, "MyFunction", {
      functionName: "FooBar",
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200, body: "Hello, World!" });'),
      handler: "index.handler",
    });

    // @TODO: add throtling and rate limiting as global params
    // @TODO: do we need to add API versioning among global params?
    // @TODO: ensure possible injections isolation at the parameters parsing stage

    // @TODO: in addition to the API the documentation deployer construct might be created
    const api = new RestApiConstruct(this, "RestApi", {
      globalParams: {
        cors: {
          allowOrigins: apigateway.Cors.ALL_ORIGINS,
          allowMethods: apigateway.Cors.ALL_METHODS,
          allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
          allowCredentials: true,
        },
        auth: new apigateway.CognitoUserPoolsAuthorizer(this, "CognitoAuthorizer", {
          cognitoUserPools: [cognitoAuth.userPool],
          authorizerName: "CognitoAuthorizer",
          identitySource: apigateway.IdentitySource.header("Authorization"),
        }),
      },
      paths: {
        "/open": {
          get: {
            integration: new apigateway.LambdaIntegration(fooBarLambda),
            auth: false,
          },
        },
        "/lambda/base": {
          get: {
            integration: new apigateway.LambdaIntegration(fooBarLambda),
            authorizationScopes: [ApiServerScopes.USERS_READ],
          },
        },
        "/proxy/base": {
          proxy: new apigateway.LambdaIntegration(fooBarLambda),
        },
        "/lambda/params/{paramId}": {
          post: {
            function: fooBarLambda,
            queryParams: {
              someQueryParam: true,
            },
            request: z.object({
              name: z.string(),
              age: z.number(),
              users: z.array(
                z.object({
                  name: z.string(),
                  email: z.string().email(),
                  type: z.union([z.literal("admin"), z.literal("user")]),
                }),
              ),
              // @TODO: unions are not properly exported to swagger
              payload: z.union([
                z.object({ type: z.literal("payload_type_A"), value: z.string() }),
                z.object({ type: z.literal("payload_type_B"), value: z.number() }),
              ]),
              type: z.union([z.number(), z.string()]),
              literalType: z.union([z.literal("literal_type_A"), z.literal("literal_type_B")]),
              objectType: z.union([z.object({ value: z.string() }), z.object({ name: z.string() })]),
              departmend: z.discriminatedUnion("type", [
                z.object({ type: z.literal("department_type_A"), value: z.string() }),
                z.object({ type: z.literal("department_type_B"), value: z.number() }),
              ]),
              roles: z.enum(["admin", "user"]),
              permisions: z.nativeEnum(Permissions),
              bits: z.nativeEnum(Bits),
              null: z.null(),
              undefined: z.undefined(),
              intersection: z.intersection(z.object({ name: z.string() }), z.object({ age: z.number() })),
            }),
            responses: z.object({
              message: z.string(),
            }),
          },
        },
        "lambda/template": {
          post: templateLambdaFactory(this, "TemplateLambda"),
        },
      },
    });
  }
}
