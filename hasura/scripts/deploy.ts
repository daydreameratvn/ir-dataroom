import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ECSClient, UpdateServiceCommand } from "@aws-sdk/client-ecs";
import { fetchSSMParams, requireParam } from "../lib/ssm.ts";

const REGION = "ap-southeast-1";

const params = await fetchSSMParams();
const s3Bucket = requireParam(params, "metadata-s3-bucket");
const ecsCluster = requireParam(params, "ecs-cluster");
const ecsService = requireParam(params, "ecs-engine-service");

const s3 = new S3Client({ region: REGION });
const ecs = new ECSClient({ region: REGION });

const metadataFiles = [
  { key: "open_dd.json", path: new URL("../metadata/open_dd.json", import.meta.url) },
  { key: "auth_config.json", path: new URL("../metadata/auth_config.json", import.meta.url) },
  { key: "metadata.json", path: new URL("../metadata/metadata.json", import.meta.url) },
];

console.log(`Uploading metadata to s3://${s3Bucket}/...`);

for (const file of metadataFiles) {
  const body = await Bun.file(file.path).text();
  await s3.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: file.key,
      Body: body,
      ContentType: "application/json",
    }),
  );
  console.log(`  Uploaded ${file.key}`);
}

console.log(`\nTriggering ECS redeployment...`);
console.log(`  Cluster: ${ecsCluster}`);
console.log(`  Service: ${ecsService}`);

await ecs.send(
  new UpdateServiceCommand({
    cluster: ecsCluster,
    service: ecsService,
    forceNewDeployment: true,
  }),
);

console.log("\nDeploy initiated. The engine will pick up new metadata on restart.");
