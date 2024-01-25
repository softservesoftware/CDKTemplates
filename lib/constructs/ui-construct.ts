import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

export interface UiParams {
  cert: certificatemanager.Certificate;
  domain: string;
  zone: route53.IHostedZone;
  buildPath: string;
}

export class UiConstruct extends Construct {
  public readonly createRecordLambda: lambda.Function;
  constructor(scope: Construct, id: string, params: UiParams) {
    super(scope, id);

    // s3 static site deployment for landing page
    const uiBucket = new s3.Bucket(this, `bucket`, {});

    // landing page distribution
    const uiDistribution = new cloudfront.Distribution(
      this,
      `distribution`,
      {
        certificate: params.cert,
        domainNames: [params.domain],
        defaultBehavior: {
          origin: new cdk.aws_cloudfront_origins.S3Origin(uiBucket),
          viewerProtocolPolicy:
            cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        defaultRootObject: "index.html",
        errorResponses: [
            {
              httpStatus: 404,
              responseHttpStatus: 200,
              responsePagePath: "/index.html",
            },
            {
              httpStatus: 403,
              responseHttpStatus: 200,
              responsePagePath: "/index.html",
            },
          ],
      }
    );
    const landingPageDeployment = new s3deploy.BucketDeployment(
      this,
      `deployment`,
      {
        sources: [cdk.aws_s3_deployment.Source.asset(params.buildPath)],
        destinationBucket: uiBucket,
        distribution: uiDistribution,
        distributionPaths: ["/*"],
      }
    );
    if (params.domain.split('.').length===3) {
      // Non-apex domain - create a CNAME record
      new route53.CnameRecord(this, `cname-record`, {
        zone: params.zone,
        recordName: params.domain,
        domainName: uiDistribution.distributionDomainName,
      });
    } else {
      // Apex domain - create an A record
      new route53.ARecord(this, `a-record`, {
        zone: params.zone,
        recordName: params.domain,
        target: route53.RecordTarget.fromAlias(new cdk.aws_route53_targets.CloudFrontTarget(uiDistribution)),
      });
    }

    // // cloudformation exports
    new cdk.CfnOutput(this, `bucket-name`, {
      value: uiBucket.bucketName,
    });
    new cdk.CfnOutput(this, `distribution-domain-name`, {
      value: uiDistribution.distributionDomainName,
    });
    new cdk.CfnOutput(this, `distribution-id`, {
      value: uiDistribution.distributionId,
    });
  }
}
