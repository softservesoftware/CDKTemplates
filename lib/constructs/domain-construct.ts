import * as cdk from "aws-cdk-lib";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
export interface DomainParams {
  domain: string;
}
export class DomainConstruct extends Construct {
  public readonly zone: route53.IHostedZone;
  public readonly wildcardCert: certificatemanager.Certificate;
  public readonly bareCert: certificatemanager.Certificate;
  constructor(scope: Construct, id: string, params: DomainParams) {
    super(scope, id);
    // cert for the domain name
    this.bareCert = new certificatemanager.Certificate(this, "Certificate", {
      domainName: params.domain,
      validation: certificatemanager.CertificateValidation.fromDns(),
    });

    this.wildcardCert = new certificatemanager.Certificate(this, "WildcardCertificate", {
      domainName: `*.${params.domain}`,
      validation: certificatemanager.CertificateValidation.fromDns(),
    });
    // hosted zone for domain name
    this.zone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: `${params.domain}`,
    });
  }
}
