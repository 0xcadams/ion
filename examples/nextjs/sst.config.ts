/// <reference path="./.sst/platform/src/global.d.ts" />

export default $config({
  app(input) {
    return {
      name: "nextjs",
      removalPolicy: input?.stage === "production" ? "retain" : "remove",
    };
  },
  async run() {
    const StripeKey = new sst.Secret("StripeKey");
    const site = new sst.aws.Nextjs("Web", {
      //domain: "ion-next.sst.sh",
      //      domain: {
      //        domainName: "ion-next.sst.sh",
      //        aliases: ["ion-nextjs.sst.sh"],
      //        redirects: ["www.ion-next.sst.sh"],
      //        hostedZone: "sst.sh",
      //      },
    });
  },
});
