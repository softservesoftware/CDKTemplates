import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
export interface DynamoParams {
  tableName: string;
  partitionKey: {
    name: string;
    type: dynamodb.AttributeType;
  };
  sortKey: {
    name: string;
    type: dynamodb.AttributeType;
  };
  systemLogLevel: lambda.SystemLogLevel;
  applicationLogLevel: lambda.ApplicationLogLevel;
}

export class DynamoConstruct extends Construct {
  public readonly createRecordLambda: lambda.Function;
  public readonly readRecordLambda: lambda.Function;
  public readonly updateRecordLambda: lambda.Function;
  public readonly deleteRecordLambda: lambda.Function;
  public readonly databaseTable: dynamodb.Table;
  public readonly changeHandlerLambda: lambda.Function;
  public readonly readManyRecordsLambda: lambda.Function;
  constructor(scope: Construct, id: string, params: DynamoParams) {
    super(scope, id);

    // dynamo table to store video metadata and links
    this.databaseTable = new dynamodb.Table(this, `${params.tableName}`, {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: params.partitionKey,
      sortKey: params.sortKey,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
    });

    // lambdas for db queries
    // create lambda
    this.createRecordLambda = new lambda.Function(this, "CreateRecordLambda", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lib/constructs/dynamo/lambda"),
      handler: "create.lambda_handler",
      logFormat: lambda.LogFormat.JSON,
      systemLogLevel: params.systemLogLevel,
      applicationLogLevel: params.applicationLogLevel,
      environment: {
        TABLE_NAME: this.databaseTable.tableName,
        PARTITION_KEY: params.partitionKey.name,
        SORT_KEY: params.sortKey.name,
      },
    });
    // give permission to write to table
    this.databaseTable.grantWriteData(this.createRecordLambda);

    // read lambda
    this.readRecordLambda = new lambda.Function(this, "ReadRecordLambda", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lib/constructs/dynamo/lambda"),
      handler: "read.lambda_handler",
      logFormat: lambda.LogFormat.JSON,
      systemLogLevel: params.systemLogLevel,
      applicationLogLevel: params.applicationLogLevel,
      environment: {
        TABLE_NAME: this.databaseTable.tableName,
        PARTITION_KEY: params.partitionKey.name,
        SORT_KEY: params.sortKey.name,
      },
    });
    // give permission to read from table
    this.databaseTable.grantReadData(this.readRecordLambda);

    // create read many lambda
    this.readManyRecordsLambda = new lambda.Function(this, "ReadManyRecordsLambda", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lib/constructs/dynamo/lambda"),
      handler: "read_many.lambda_handler",
      // logFormat: lambda.LogFormat.JSON,
      // systemLogLevel: params.systemLogLevel,
      // applicationLogLevel: params.applicationLogLevel,
      environment: {
        TABLE_NAME: this.databaseTable.tableName,
        PARTITION_KEY: params.partitionKey.name,
        SORT_KEY: params.sortKey.name,
      },
    });
    // give permission to read from table
    this.databaseTable.grantReadData(this.readManyRecordsLambda);

    // update lambda
    this.updateRecordLambda = new lambda.Function(this, "UpdateRecordLambda", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lib/constructs/dynamo/lambda"),
      handler: "update.lambda_handler",
      logFormat: lambda.LogFormat.JSON,
      systemLogLevel: params.systemLogLevel,
      applicationLogLevel: params.applicationLogLevel,
      environment: {
        TABLE_NAME: this.databaseTable.tableName,
        PARTITION_KEY: params.partitionKey.name,
        SORT_KEY: params.sortKey.name,
      },
    });
    // give permission to write to table
    this.databaseTable.grantWriteData(this.updateRecordLambda);

    // delete lambda
    this.deleteRecordLambda = new lambda.Function(this, "DeleteRecordLambda", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lib/constructs/dynamo/lambda"),
      handler: "delete.lambda_handler",
      logFormat: lambda.LogFormat.JSON,
      systemLogLevel: params.systemLogLevel,
      applicationLogLevel: params.applicationLogLevel,
      environment: {
        TABLE_NAME: this.databaseTable.tableName,
        PARTITION_KEY: params.partitionKey.name,
        SORT_KEY: params.sortKey.name,
      },
    });
    // give permission to delete items in table
    this.databaseTable.grantWriteData(this.deleteRecordLambda);

    // create a change handler lambda
    this.changeHandlerLambda = new lambda.Function(this, "ChangeHandlerLambda", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lib/constructs/dynamo/lambda"),
      handler: "read.lambda_handler",
      logFormat: lambda.LogFormat.JSON,
      systemLogLevel: params.systemLogLevel,
      applicationLogLevel: params.applicationLogLevel,
      environment: {
        TABLE_NAME: this.databaseTable.tableName,
        PARTITION_KEY: params.partitionKey.name,
        SORT_KEY: params.sortKey.name,
      },
    });

    // give permission to read from table
    // give permission to read & write from table
    this.databaseTable.grantReadWriteData(this.changeHandlerLambda);
    this.databaseTable.grantStreamRead(this.changeHandlerLambda);
    this.databaseTable.grantWriteData(this.changeHandlerLambda);

    // subscribe to stream
    this.changeHandlerLambda.addEventSource(
      new lambdaEventSources.DynamoEventSource(this.databaseTable, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 1,
      }),
    );
  }
}
