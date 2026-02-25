/**
 * Start an SSM port-forwarding tunnel to the RDS instance via the bastion host.
 *
 * RDS is in isolated subnets with no direct access. This script:
 * 1. Looks up the bastion instance ID by tag (Name=banyan-prod-bastion)
 * 2. Extracts the RDS host from the connection URI in Secrets Manager
 * 3. Opens an SSM port-forwarding session on localhost:15432
 *
 * Prerequisites:
 *   brew install --cask session-manager-plugin
 *   AWS_PROFILE=banyan (with SSM + EC2 describe permissions)
 */

import { getRdsHost, TUNNEL_PORT } from "../lib/db.ts";

const REGION = "ap-southeast-1";
const REMOTE_PORT = "5432";

// Find bastion instance ID by tag
async function getBastionInstanceId(): Promise<string> {
  const { EC2Client, DescribeInstancesCommand } = await import(
    "@aws-sdk/client-ec2"
  );
  const client = new EC2Client({ region: REGION });
  const resp = await client.send(
    new DescribeInstancesCommand({
      Filters: [
        { Name: "tag:Name", Values: ["banyan-prod-bastion"] },
        { Name: "instance-state-name", Values: ["running"] },
      ],
    }),
  );
  const instance = resp.Reservations?.[0]?.Instances?.[0];
  if (!instance?.InstanceId) {
    throw new Error("Bastion instance not found or not running");
  }
  return instance.InstanceId;
}

const [bastionId, rdsHost] = await Promise.all([
  getBastionInstanceId(),
  getRdsHost(),
]);

console.log(`Bastion: ${bastionId}`);
console.log(`RDS host: ${rdsHost}`);
console.log(`Tunnel: localhost:${TUNNEL_PORT} -> ${rdsHost}:${REMOTE_PORT}`);
console.log("Press Ctrl+C to stop the tunnel.\n");

const proc = Bun.spawn(
  [
    "aws",
    "ssm",
    "start-session",
    "--region",
    REGION,
    "--target",
    bastionId,
    "--document-name",
    "AWS-StartPortForwardingSessionToRemoteHost",
    "--parameters",
    JSON.stringify({
      host: [rdsHost],
      portNumber: [REMOTE_PORT],
      localPortNumber: [String(TUNNEL_PORT)],
    }),
  ],
  {
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  },
);

await proc.exited;
