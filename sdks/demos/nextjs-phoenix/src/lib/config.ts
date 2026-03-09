export const PHOENIX_URL = process.env.NEXT_PUBLIC_PHOENIX_URL ?? 'https://prod.banyan.services.papaya.asia';
export const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'https://banyan.services.papaya.asia/graphql';
export const POLICY_NUMBERS = (process.env.NEXT_PUBLIC_POLICY_NUMBERS ?? '287686').split(',');
export const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? undefined;
