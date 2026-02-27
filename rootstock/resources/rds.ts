import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { dbConfig } from "../config.ts";
import { mergeTags } from "../lib/tags.ts";
import { banyanRdsSg } from "./security-groups.ts";
import { banyanIsolatedSubnets } from "./vpc.ts";

// ============================================================
// Random Password
// ============================================================

const banyanDbPassword = new random.RandomPassword("banyan-prod-db-password", {
  length: 32,
  special: true,
  overrideSpecial: "!#$%&*()-_=+[]{}|:?",
});

// ============================================================
// Secrets Manager Secret
// ============================================================

export const banyanDbSecret = new aws.secretsmanager.Secret("banyan-prod-db-secret", {
  name: "banyan-prod-db-credentials",
  description: "RDS PostgreSQL credentials for banyan DDN",
  tags: mergeTags({
    Name: "banyan-prod-db-secret",
    Component: "secrets-manager",
  }),
});

// ============================================================
// RDS Subnet Group
// ============================================================

const banyanDbSubnetGroup = new aws.rds.SubnetGroup("banyan-prod-db-subnet-group", {
  name: "banyan-prod-db-subnet-group",
  subnetIds: banyanIsolatedSubnets.map((s) => s.id),
  tags: mergeTags({
    Name: "banyan-prod-db-subnet-group",
    Component: "rds",
  }),
});

// ============================================================
// RDS Parameter Group (logical replication for Doltgres)
// ============================================================

const banyanDbParamGroup = new aws.rds.ParameterGroup("banyan-prod-db-param-group", {
  name: "banyan-prod-db-param-group",
  family: "postgres17",
  description: "PostgreSQL 17 with logical replication enabled for Doltgres",
  parameters: [
    { name: "rds.logical_replication", value: "1", applyMethod: "pending-reboot" },
    { name: "max_replication_slots", value: "5", applyMethod: "pending-reboot" },
    { name: "max_wal_senders", value: "5", applyMethod: "pending-reboot" },
    // Disable forced SSL so internal VPC connections (Doltgres replication) work without SSL.
    // Public connections (via NLB) enforce SSL at the client level with sslmode=require.
    { name: "rds.force_ssl", value: "0", applyMethod: "pending-reboot" },
  ],
  tags: mergeTags({ Name: "banyan-prod-db-param-group", Component: "rds" }),
});

// ============================================================
// RDS PostgreSQL Instance
// ============================================================

export const banyanDb = new aws.rds.Instance("banyan-prod-db", {
  identifier: "banyan-prod-db",
  engine: "postgres",
  engineVersion: dbConfig.engineVersion,
  instanceClass: dbConfig.instanceClass,
  allocatedStorage: dbConfig.allocatedStorage,
  storageType: "gp3",
  storageEncrypted: true,
  multiAz: false,
  parameterGroupName: banyanDbParamGroup.name,
  dbSubnetGroupName: banyanDbSubnetGroup.name,
  vpcSecurityGroupIds: [banyanRdsSg.id],
  username: "banyan_admin",
  password: banyanDbPassword.result,
  dbName: dbConfig.name,
  skipFinalSnapshot: false,
  finalSnapshotIdentifier: "banyan-prod-db-final-snapshot",
  backupRetentionPeriod: 7,
  allowMajorVersionUpgrade: true,
  deletionProtection: true,
  tags: mergeTags({ Name: "banyan-prod-db", Component: "rds" }),
});

// ============================================================
// Secret Version (created after RDS to include endpoint)
// ============================================================

new aws.secretsmanager.SecretVersion("banyan-prod-db-secret-version", {
  secretId: banyanDbSecret.id,
  secretString: pulumi.all([banyanDbPassword.result, banyanDb.endpoint, banyanDb.address]).apply(([password, endpoint, address]) =>
    JSON.stringify({
      username: "banyan_admin",
      password,
      host: address,
      port: 5432,
      dbname: dbConfig.name,
      endpoint,
      // sslmode=require ensures DDN Cloud connections (via NLB) are always encrypted
      // using PostgreSQL native SSL, even though RDS doesn't force SSL globally.
      connection_uri: `postgresql://banyan_admin:${encodeURIComponent(password)}@${address}:5432/${dbConfig.name}?sslmode=require`,
    }),
  ),
});
