import { WorkOS } from "@workos-inc/node";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const region = process.env.AWS_REGION || "ap-southeast-1";
const ssmClient = new SSMClient({ region });

let cachedWorkOS: WorkOS | null = null;
let cachedClientId: string | null = null;

async function getSSMParam(name: string): Promise<string> {
  const resp = await ssmClient.send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
  );
  return resp.Parameter!.Value!;
}

export async function getWorkOSClient(): Promise<WorkOS> {
  if (cachedWorkOS) return cachedWorkOS;

  const apiKey =
    process.env.WORKOS_API_KEY ??
    (await getSSMParam("/banyan/auth/workos/api-key"));

  cachedWorkOS = new WorkOS(apiKey);
  return cachedWorkOS;
}

export async function getWorkOSClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;

  cachedClientId =
    process.env.WORKOS_CLIENT_ID ??
    (await getSSMParam("/banyan/auth/workos/client-id"));

  return cachedClientId;
}

export function getWorkOSRedirectUri(): string {
  const baseUrl = process.env.AUTH_BASE_URL || "https://oasis.papaya.asia";
  return `${baseUrl}/auth/workos/callback`;
}
