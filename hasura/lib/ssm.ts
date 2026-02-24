import {
  SSMClient,
  paginateGetParametersByPath,
} from "@aws-sdk/client-ssm";

const SSM_PATH = "/banyan/hasura/";
const REGION = "ap-southeast-1";

export async function fetchSSMParams(): Promise<Map<string, string>> {
  const client = new SSMClient({ region: REGION });
  const params = new Map<string, string>();

  const paginator = paginateGetParametersByPath(
    { client },
    { Path: SSM_PATH, WithDecryption: true, Recursive: true },
  );

  for await (const page of paginator) {
    for (const param of page.Parameters ?? []) {
      if (param.Name && param.Value) {
        const key = param.Name.replace(SSM_PATH, "");
        params.set(key, param.Value);
      }
    }
  }

  return params;
}

export function requireParam(params: Map<string, string>, key: string): string {
  const value = params.get(key);
  if (!value) {
    throw new Error(`Missing required SSM parameter: ${SSM_PATH}${key}`);
  }
  return value;
}
