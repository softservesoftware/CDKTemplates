import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { ApiResourceLambdaDefinition } from "../../lib/types";
import { Construct } from "constructs";
import * as path from "node:path";
import { z } from "zod";
import { PaymentsPermissions } from "../../types";

const infraFactory = (scope: Construct, name: string): ApiResourceLambdaDefinition => ({
    function: new NodejsFunction(scope, name, {
        functionName: name,
        entry: path.join(__dirname, "handler.ts"),
        handler: "handler",
        depsLockFilePath: path.join(__dirname, "../../yarn.lock"),
    }),
    request: z.object({
        value: z.string(),
        someOf: z.union([z.literal("a"), z.literal("b"), z.literal("c")]).optional(),
    }),
    // responses: z.object({
    //     statusCode: z.number(),
    //     message: z.string(),
    // }),
    // auth: false,
    authorizationScopes: [`api-server/${PaymentsPermissions.CREATE_PAYMENT}`],
});

export default infraFactory;
