import {
  ComponentResource,
  ComponentResourceOptions,
  Inputs,
  interpolate,
  output,
} from "@pulumi/pulumi";
import { prefixName } from "./naming.js";

/**
 * Helper type to inline nested types
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type Transform<T> = T | ((args: T) => void | T);
export function transform<T extends object>(
  transform: Transform<T> | undefined,
  args: T,
) {
  // Case: transform is a function
  if (typeof transform === "function") {
    const ret = transform(args);
    return ret ?? args;
  }

  // Case: no transform
  // Case: transform is an argument
  return { ...args, ...transform };
}

export class Component extends ComponentResource {
  constructor(
    type: string,
    name: string,
    args?: Inputs,
    opts?: ComponentResourceOptions,
  ) {
    super(type, name, args, {
      transformations: [
        (args) => {
          // Ensure names are prefixed with parent's name
          if (
            args.type !== type &&
            // @ts-expect-error
            !args.name.startsWith(args.opts.parent!.__name)
          ) {
            throw new Error(
              `In "${name}" component, the name of "${args.name}" (${args.type}) is not prefixed with parent's name`,
            );
          }

          // Ensure physical names are prefixed with app/stage
          if (args.type.startsWith("sst:")) return undefined;
          if (args.type === "pulumi-nodejs:dynamic:Resource") return undefined;
          if (args.type === "random:index/randomId:RandomId") return undefined;

          let overrides;
          switch (args.type) {
            case "aws:apigatewayv2/api:Api":
            case "aws:iam/policy:Policy":
            case "aws:iam/role:Role":
            case "aws:iam/user:User":
            case "aws:iam/userPolicy:UserPolicy":
            case "aws:cloudwatch/eventRule:EventRule":
            case "aws:lambda/function:Function":
            case "aws:dynamodb/table:Table":
            case "aws:sns/topic:Topic":
              overrides = { name: prefixName(args.name) };
              break;
            case "cloudflare:index/r2Bucket:R2Bucket":
            case "cloudflare:index/workerScript:WorkerScript":
              overrides = { name: prefixName(args.name).toLocaleLowerCase() };
              break;
            case "aws:rds/cluster:Cluster":
              overrides = {
                clusterIdentifier: prefixName(args.name).toLocaleLowerCase(),
              };
              break;
            case "aws:rds/clusterInstance:ClusterInstance":
              overrides = {
                identifier: prefixName(args.name).toLocaleLowerCase(),
              };
              break;
            case "aws:sqs/queue:Queue":
              const suffix = output(args.props.fifoQueue).apply((fifo) =>
                fifo ? ".fifo" : "",
              );
              overrides = {
                name: interpolate`${prefixName(args.name)}${suffix}`,
              };
              break;
            case "aws:apigatewayv2/apiMapping:ApiMapping":
            case "aws:apigatewayv2/domainName:DomainName":
            case "aws:apigatewayv2/integration:Integration":
            case "aws:apigatewayv2/route:Route":
            case "aws:apigatewayv2/stage:Stage":
            case "aws:acm/certificate:Certificate":
            case "aws:acm/certificateValidation:CertificateValidation":
            case "aws:iam/accessKey:AccessKey":
            case "aws:iam/rolePolicyAttachment:RolePolicyAttachment":
            case "aws:cloudfront/cachePolicy:CachePolicy":
            case "aws:cloudfront/distribution:Distribution":
            case "aws:cloudfront/function:Function":
            case "aws:cloudfront/originAccessIdentity:OriginAccessIdentity":
            case "aws:cloudwatch/eventRule:EventRule":
            case "aws:cloudwatch/eventTarget:EventTarget":
            case "aws:cloudwatch/logGroup:LogGroup":
            case "aws:lambda/eventSourceMapping:EventSourceMapping":
            case "aws:lambda/functionUrl:FunctionUrl":
            case "aws:lambda/invocation:Invocation":
            case "aws:lambda/permission:Permission":
            case "aws:route53/record:Record":
            case "aws:s3/bucketNotification:BucketNotification":
            case "aws:s3/bucketObject:BucketObject":
            case "aws:s3/bucketObjectv2:BucketObjectv2":
            case "aws:s3/bucketPolicy:BucketPolicy":
            case "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock":
            case "aws:s3/bucketV2:BucketV2":
            case "aws:s3/bucketWebsiteConfigurationV2:BucketWebsiteConfigurationV2":
            case "aws:sns/topicSubscription:TopicSubscription":
            case "cloudflare:index/workerDomain:WorkerDomain":
              break;
            default:
              throw new Error(
                `In "${name}" component, the physical name of "${args.name}" (${args.type}) is not prefixed`,
              );
          }
          return {
            props: { ...args.props, ...overrides },
            opts: args.opts,
          };
        },
      ],
      ...opts,
    });
  }
}
