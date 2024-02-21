import fs from "fs";
import path from "path";
import { ComponentResourceOptions, Output, all, output } from "@pulumi/pulumi";
import { Function } from "./function.js";
import {
  SsrSiteArgs,
  buildApp,
  createBucket,
  createServersAndDistribution,
  prepare,
  useCloudFrontFunctionHostHeaderInjection,
  validatePlan,
} from "./ssr-site.js";
import { Cdn } from "./cdn.js";
import { Bucket } from "./bucket.js";
import { Component, transform } from "../component.js";
import { Hint } from "../hint.js";
import { Link } from "../link.js";
import type { Input } from "../input.js";

export interface RemixArgs extends SsrSiteArgs {
  /**
   * The server function is deployed to Lambda in a single region. Alternatively, you can enable this option to deploy to Lambda@Edge.
   * @default `false`
   */
  edge?: Input<boolean>;
}

/**
 * The `Remix` component makes it easy to create an Remix app.
 * @example
 * #### Using the minimal config
 * ```js
 * new sst.aws.Remix("Web", {
 *   path: "my-remix-app/",
 * });
 * ```
 */
export class Remix extends Component implements Link.Linkable {
  private cdn: Output<Cdn>;
  private assets: Bucket;
  private server: Output<Function>;

  constructor(
    name: string,
    args: RemixArgs = {},
    opts: ComponentResourceOptions = {},
  ) {
    super("sst:aws:Remix", name, args, opts);

    const parent = this;
    const edge = normalizeEdge();
    const { sitePath, region } = prepare(args, opts);
    const { access, bucket } = createBucket(parent, name);
    const outputPath = buildApp(name, args, sitePath);
    const plan = buildPlan();
    const { distribution, ssrFunctions, edgeFunctions } =
      createServersAndDistribution(
        parent,
        name,
        args,
        outputPath,
        access,
        bucket,
        plan,
      );
    const serverFunction = ssrFunctions[0] ?? Object.values(edgeFunctions)[0];

    this.assets = bucket;
    this.cdn = distribution;
    this.server = serverFunction;
    Hint.register(
      this.urn,
      all([this.cdn.domainUrl, this.cdn.url]).apply(
        ([domainUrl, url]) => domainUrl ?? url,
      ),
    );
    this.registerOutputs({
      _metadata: {
        mode: $dev ? "placeholder" : "deployed",
        path: sitePath,
        customDomainUrl: this.cdn.domainUrl,
        edge,
      },
    });

    function normalizeEdge() {
      return output(args?.edge).apply((edge) => edge ?? false);
    }

    function buildPlan() {
      return all([outputPath, edge]).apply(([outputPath, edge]) => {
        const serverConfig = createServerLambdaBundle(
          outputPath,
          edge ? "edge-server.mjs" : "regional-server.mjs",
        );

        return validatePlan(
          transform(args?.transform?.plan, {
            edge,
            cloudFrontFunctions: {
              serverCfFunction: {
                injections: [useCloudFrontFunctionHostHeaderInjection()],
              },
              staticCfFunction: {
                injections: [
                  // Note: When using libraries like remix-flat-routes the file can
                  // contains special characters like "+". It needs to be encoded.
                  `request.uri = request.uri.split('/').map(encodeURIComponent).join('/');`,
                ],
              },
            },
            edgeFunctions: edge
              ? {
                  server: {
                    function: serverConfig,
                  },
                }
              : undefined,
            origins: {
              ...(edge
                ? {}
                : {
                    server: {
                      server: {
                        function: serverConfig,
                      },
                    },
                  }),
              s3: {
                s3: {
                  copy: [
                    {
                      from: "public",
                      to: "",
                      cached: true,
                      versionedSubDir: "build",
                    },
                  ],
                },
              },
            },
            behaviors: [
              edge
                ? {
                    cacheType: "server",
                    cfFunction: "serverCfFunction",
                    edgeFunction: "server",
                    origin: "s3",
                  }
                : {
                    cacheType: "server",
                    cfFunction: "serverCfFunction",
                    origin: "server",
                  },
              // create 1 behaviour for each top level asset file/folder
              ...fs.readdirSync(path.join(outputPath, "public")).map(
                (item) =>
                  ({
                    cacheType: "static",
                    pattern: fs
                      .statSync(path.join(outputPath, "public", item))
                      .isDirectory()
                      ? `${item}/*`
                      : item,
                    cfFunction: "staticCfFunction",
                    origin: "s3",
                  }) as const,
              ),
            ],
          }),
        );
      });
    }

    function createServerLambdaBundle(outputPath: string, wrapperFile: string) {
      // Create a Lambda@Edge handler for the Remix server bundle.
      //
      // Note: Remix does perform their own internal ESBuild process, but it
      // doesn't bundle 3rd party dependencies by default. In the interest of
      // keeping deployments seamless for users we will create a server bundle
      // with all dependencies included. We will still need to consider how to
      // address any need for external dependencies, although I think we should
      // possibly consider this at a later date.

      // In this path we are assuming that the Remix build only outputs the
      // "core server build". We can safely assume this as we have guarded the
      // remix.config.js to ensure it matches our expectations for the build
      // configuration.
      // We need to ensure that the "core server build" is wrapped with an
      // appropriate Lambda@Edge handler. We will utilise an internal asset
      // template to create this wrapper within the "core server build" output
      // directory.

      // Ensure build directory exists
      const buildPath = path.join(outputPath, "build");
      fs.mkdirSync(buildPath, { recursive: true });

      // Copy the server lambda handler
      fs.copyFileSync(
        path.join(
          $cli.paths.platform,
          "functions",
          "remix-server",
          wrapperFile,
        ),
        path.join(buildPath, "server.mjs"),
      );

      // Copy the Remix polyfil to the server build directory
      //
      // Note: We need to ensure that the polyfills are injected above other code that
      // will depend on them. Importing them within the top of the lambda code
      // doesn't appear to guarantee this, we therefore leverage ESBUild's
      // `inject` option to ensure that the polyfills are injected at the top of
      // the bundle.
      const polyfillDest = path.join(buildPath, "polyfill.mjs");
      fs.copyFileSync(
        path.join(
          $cli.paths.platform,
          "functions",
          "remix-server",
          "polyfill.mjs",
        ),
        polyfillDest,
      );

      return {
        handler: path.join(buildPath, "server.handler"),
        nodejs: {
          esbuild: {
            inject: [polyfillDest],
          },
        },
      };
    }
  }

  /**
   * The CloudFront URL of the website.
   */
  public get url() {
    return this.cdn.url;
  }

  /**
   * If the custom domain is enabled, this is the URL of the website with the
   * custom domain.
   */
  public get domainUrl() {
    return this.cdn.domainUrl;
  }

  /**
   * The internally created CDK resources.
   */
  public get nodes() {
    return {
      server: this.server as unknown as Function,
      assets: this.assets,
    };
  }

  /** @internal */
  public getSSTLink() {
    return {
      type: `{ url: string; }`,
      value: {
        url: this.url,
      },
    };
  }
}
