import type { PhoenixEnvironment } from '@papaya/phoenix';

export const PHOENIX_ENVIRONMENT: PhoenixEnvironment =
  (process.env.NEXT_PUBLIC_PHOENIX_ENV as PhoenixEnvironment) ?? 'production';
export const GRAPHQL_URL_OVERRIDE = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? undefined;
export const POLICY_NUMBERS = (process.env.NEXT_PUBLIC_POLICY_NUMBERS ?? '287686').split(',');
export const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? undefined;
