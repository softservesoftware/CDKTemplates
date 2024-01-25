import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { z } from "zod";
import { RestApiConstruct } from "./constructs/rest-api-construct";
import { UiConstruct } from "./constructs/ui-construct";
import { DomainConstruct } from "./constructs/domain-construct";
import { DynamoConstruct } from "./constructs/dynamo/dynamo-construct";
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

export class CdkTemplatesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // dyamo db construct
    const dynamo = new DynamoConstruct(this, "Dynamo", {
      tableName: "MyTable",
      partitionKey: {
        name: "exampple_id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "example_sort",
        type: dynamodb.AttributeType.STRING,
      },
      systemLogLevel: lambda.SystemLogLevel.INFO,
      applicationLogLevel: lambda.ApplicationLogLevel.INFO,
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
      },
      paths: {
        "/lambda/base": {
          get: new apigateway.LambdaIntegration(fooBarLambda),
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
            }),
            responses: z.object({
              message: z.string(),
            }),
          },
        },
      },
    });

    
  }
}
