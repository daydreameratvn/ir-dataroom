import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

export const awsConfig = {
  region: config.require("awsRegion"),
};

export const stackName = pulumi.getStack();

export const environment = config.get("environment") || "prod";

export const vpcConfig = {
  cidr: config.get("vpcCidr") || "10.50.0.0/16",
  availabilityZones: ["ap-southeast-1a", "ap-southeast-1b"],
};

export const dbConfig = {
  instanceClass: config.get("dbInstanceClass") || "db.t4g.medium",
  allocatedStorage: Number(config.get("dbAllocatedStorage") || "50"),
  name: config.get("dbName") || "banyan",
  engineVersion: "17",
};

export const domainConfig = {
  domainName: config.require("domainName"),
};

export const doltgresConfig = {
  cpu: Number(config.get("doltgresCpu") || "1024"),
  memory: Number(config.get("doltgresMemory") || "2048"),
  dataVolumeSize: Number(config.get("doltgresDataVolumeSize") || "50"),
};


export const gcpConfig = {
  project: config.require("gcpProject"),
  region: config.get("gcpRegion") || "asia-southeast1",
};

export const oauthConfig = {
  google: {
    clientId: config.requireSecret("googleOAuthClientId"),
    clientSecret: config.requireSecret("googleOAuthClientSecret"),
  },
  microsoft: {
    clientId: config.requireSecret("microsoftOAuthClientId"),
    clientSecret: config.requireSecret("microsoftOAuthClientSecret"),
  },
  apple: {
    clientId: config.requireSecret("appleOAuthClientId"),
    clientSecret: config.requireSecret("appleOAuthClientSecret"),
  },
};

export const projectConfig = {
  name: "banyan-ddn",
  owner: "rootstock-team",
};
