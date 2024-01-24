import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { AuthParams } from "../types";

export class CognitoAuth extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly identityProviders: Partial<Record<"google", cognito.UserPoolIdentityProvider>> = {};

  constructor(scope: Construct, id: string, params: AuthParams) {
    super(scope, id);

    const emailAuthParans: cognito.UserPoolProps = {
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      // Message customization: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-settings-message-customizations.html
      // Message templates: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-settings-message-templates.html
      userVerification: {
        emailSubject: "Verify your email for our awesome app!",
        emailBody: "{##Verify Email##}",
        emailStyle: cognito.VerificationEmailStyle.LINK,
      },
      // Might allow the user to sign in when they changed their email/password but not verified it yet
      // Credentials verification: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-email-phone-verification.html?icmpid=docs_cognito_console_help_panel
      keepOriginal: {
        email: true,
      },

      passwordPolicy: {
        minLength: 8,
        tempPasswordValidity: cdk.Duration.days(7),
      },

      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      // When admin invites users
      // userInvitation: {
      //   emailSubject: 'Invite to join our awesome app!',
      //   emailBody: 'Hello {username}, you have been invited to join our awesome app! Your temporary password is {####}',
      //   smsMessage: 'Hello {username}, your temporary password for our awesome app is {####}',
      // },

      // Email configuration: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html
      // Configuring to use SES: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html#user-pool-email-developer
      email: cognito.UserPoolEmail.withCognito(),
    };

    this.userPool = new cognito.UserPool(this, "UserPool", {
      // User sign-ups: https://docs.aws.amazon.com/cognito/latest/developerguide/signing-up-users-in-your-app.html
      selfSignUpEnabled: params.signUpEnabled,
      ...(params.email ? emailAuthParans : null),

      // Advanced security monitoring: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-settings-advanced-security.html
      advancedSecurityMode: cognito.AdvancedSecurityMode.OFF,

      // Stored as part of the user's profiles
      // User attributes: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html
      // standardAttributes: {},
      // customAttributes: {},

      // Device tracking: https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-device-tracking.html
      // deviceTracking: {
      //   challengeRequiredOnNewDevice: false,
      //   deviceOnlyRememberedOnUserPrompt: true,
      // },

      // Lambda triggers: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools-working-with-aws-lambda-triggers.html
      // Available triggers: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools-working-with-aws-lambda-triggers.html
      lambdaTriggers: {},
    });

    if (params.google) {
      // Using third-party IDP: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation.html
      this.identityProviders.google = new cognito.UserPoolIdentityProviderGoogle(this, "GoogleIdentityProvider", {
        userPool: this.userPool,
        clientId: params.google.clientId,
        clientSecret: params.google.clientSecret,
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
        scopes: ["profile", "email"],
      });
    }

    // Cognito domain for hosted UI: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-assign-domain-prefix.html
    // Custom domain for hosted UI: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-add-custom-domain.html
    // Configuring hosted UI: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-app-integration.html#cognito-user-pools-create-an-app-integration
    // const customDomain = userPool.addDomain("CustomDomain", {
    //   customDomain: {
    //     domainName: "users.example.com",
    //     certificate: null,
    //   }
    // });

    // const signInUrl = customDomain.signInUrl(clientApp, {
    //   redirectUri: "http://localhost:3000",
    // });
  }

  public addResourceServer(id: string, params: { scopes: Array<string | { name: string; description: string }> }) {
    const scopes = params.scopes
      .map((scope) => (typeof scope === "string" ? { name: scope, description: "unspecified" } : scope))
      .map(
        (scope) =>
          new cognito.ResourceServerScope({
            scopeName: scope.name,
            scopeDescription: scope.description,
          }),
      );

    // Working with resource servers: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html
    const resourceServer = new cognito.UserPoolResourceServer(this, id, {
      identifier: "api-server",
      userPool: this.userPool,
      scopes,
    });

    return {
      resourceServer,
      scopes,
    };
  }

  public addClientApp(
    id: string,
    options: {
      api: {
        resourceServer: { resourceServer: cognito.UserPoolResourceServer; scopes: cognito.ResourceServerScope[] };
        scopes: string[];
      };
      callbackUrls: string[];
      logoutUrls: string[];
    },
  ) {
    const supportedIdentityProviders: cognito.UserPoolClientIdentityProvider[] = [
      cognito.UserPoolClientIdentityProvider.COGNITO,
    ];

    if (this.identityProviders.google) {
      supportedIdentityProviders.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
    }

    const clientScopes: cognito.OAuthScope[] = [
      cognito.OAuthScope.EMAIL,
      cognito.OAuthScope.PROFILE,
      cognito.OAuthScope.OPENID,
    ];

    if (options.api.resourceServer && options.api.scopes.length) {
      const resourceServerScopes: cognito.OAuthScope[] = options.api.scopes
        .map((scopeName: string) => {
          const scope = options.api.resourceServer.scopes.find(
            (scope: cognito.ResourceServerScope) => scope.scopeName === scopeName,
          );

          if (!scope) {
            return null;
          }

          return cognito.OAuthScope.resourceServer(options.api.resourceServer.resourceServer, scope);
        })
        .filter((scope): scope is cognito.OAuthScope => Boolean(scope));

      clientScopes.push(...resourceServerScopes);
    }

    // Configuring client app: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html
    const clientApp = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: this.userPool,
      supportedIdentityProviders,
      // Auth flows: https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow.html
      // Custom auth flows: https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow.html#amazon-cognito-user-pools-custom-authentication-flow
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          // Works for server side apps like Next.js not for SPA
          authorizationCodeGrant: true,
        },
        scopes: clientScopes,
        callbackUrls: options.callbackUrls,
        logoutUrls: options.logoutUrls,
      },
      // User existence error: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-managing-errors.html
      preventUserExistenceErrors: true,
      authSessionValidity: cdk.Duration.minutes(15),

      // Tokens: https://docs.aws.amazon.com/en_us/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-with-identity-providers.html
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(30),

      // Read/write attributes: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html#user-pool-settings-attribute-permissions-and-scopes
      // readAttributes: new cognito.ClientAttributes().withStandardAttributes({email: true}),
      // writeAttributes: new cognito.ClientAttributes().withStandardAttributes({email: true}),

      enableTokenRevocation: true,
    });

    if (this.identityProviders.google) {
      clientApp.node.addDependency(this.identityProviders.google);
    }

    return clientApp;
  }

  public addCognitoDomain(domain: string) {
    return this.userPool.addDomain(`CognitoDomain-${domain}`, {
      cognitoDomain: {
        domainPrefix: domain,
      },
    });
  }
}
