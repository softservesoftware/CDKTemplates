import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { RestApiConstruct } from "./constructs/rest-api-construct";
import { LambdaIntegration } from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { z } from "zod";

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
 *    - add global cors
 *    - add global authorizers
 *    - add integration timeout specification
 * - add deployments and stages
 * - add custom domain
 * - [x] add request/response models and validators
 */

export class CdkTemplatesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const fooBarLambda = new lambda.Function(this, "MyFunction", {
      functionName: "FooBar",
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200, body: "Hello, World!" });'),
      handler: "index.handler",
    });

    const api = new RestApiConstruct(this, "RestApi", {
      paths: {
        "/lambda/base": {
          get: new LambdaIntegration(fooBarLambda),
        },
        "/proxy/base": {
          proxy: new LambdaIntegration(fooBarLambda),
        },
        "/lambda/params/{paramId}": {
          get: {
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
