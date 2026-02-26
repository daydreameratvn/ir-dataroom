/**
 * Start an SSM port-forwarding tunnel to the Doltgres instance via the bastion host.
 *
 * Doltgres runs on ECS Fargate in private subnets, accessible via Cloud Map
 * DNS at doltgres.ddn.internal:5432. This script:
 * 1. Looks up the bastion instance ID by tag (Name=banyan-prod-bastion)
 * 2. Opens an SSM port-forwarding session on localhost:25432
 *
 * Prerequisites:
 *   brew install --cask session-manager-plugin
 *   AWS_PROFILE=banyan (with SSM + EC2 describe permissions)
 */

const REGION = "ap-southeast-1";
const DOLTGRES_HOST = "doltgres.ddn.internal";
const REMOTE_PORT = "5432";
const LOCAL_PORT = "25432";

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

const bastionId = await getBastionInstanceId();

console.log(`Bastion: ${bastionId}`);
console.log(`Doltgres host: ${DOLTGRES_HOST}`);
console.log(`Tunnel: localhost:${LOCAL_PORT} -> ${DOLTGRES_HOST}:${REMOTE_PORT}`);
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
      host: [DOLTGRES_HOST],
      portNumber: [REMOTE_PORT],
      localPortNumber: [LOCAL_PORT],
    }),
  ],
  {
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  },
);

await proc.exited;
