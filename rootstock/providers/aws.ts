import * as aws from "@pulumi/aws";

/**
 * AWS Provider configuration
 *
 * Uses the 'banyan' AWS profile explicitly.
 */
export const awsProvider = new aws.Provider("banyan-aws-provider", {
  region: "ap-southeast-1",
  profile: "banyan",
});
