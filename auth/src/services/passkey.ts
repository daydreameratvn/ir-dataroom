import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";
import { query } from "../db/pool.ts";
import { authConfig } from "../config.ts";

interface StoredPasskey {
  id: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
  transports: string | null;
}

async function getUserPasskeys(
  userId: string,
  tenantId: string
): Promise<StoredPasskey[]> {
  const result = await query<{
    id: string;
    credential_id: string;
    public_key: string;
    sign_count: number;
    transports: string | null;
  }>(
    `SELECT id, credential_id, public_key, sign_count, transports
     FROM auth_passkeys
     WHERE user_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [userId, tenantId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    signCount: row.sign_count,
    transports: row.transports,
  }));
}

export async function generateRegOptions(
  userId: string,
  userName: string,
  tenantId: string
) {
  const existingPasskeys = await getUserPasskeys(userId, tenantId);

  return generateRegistrationOptions({
    rpName: authConfig.rpName,
    rpID: authConfig.rpId,
    userName,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    excludeCredentials: existingPasskeys.map((pk) => ({
      id: pk.credentialId,
      transports: pk.transports
        ? (pk.transports.split(",") as AuthenticatorTransportFuture[])
        : undefined,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
}

export async function verifyRegResponse(
  response: unknown,
  expectedChallenge: string
): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    response: response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
    expectedChallenge,
    expectedOrigin: authConfig.rpOrigin,
    expectedRPID: authConfig.rpId,
  });
}

export async function storePasskey(opts: {
  tenantId: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
  deviceName?: string;
  transports?: string;
}): Promise<void> {
  await query(
    `INSERT INTO auth_passkeys (tenant_id, user_id, credential_id, public_key, sign_count, device_name, transports)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      opts.tenantId,
      opts.userId,
      opts.credentialId,
      opts.publicKey,
      opts.signCount,
      opts.deviceName ?? null,
      opts.transports ?? null,
    ]
  );
}

export async function generateAuthOptions(credentialId?: string) {
  const allowCredentials = credentialId
    ? [{ id: credentialId }]
    : undefined;

  return generateAuthenticationOptions({
    rpID: authConfig.rpId,
    userVerification: "preferred",
    allowCredentials,
  });
}

export async function verifyAuthResponse(
  response: unknown,
  expectedChallenge: string
): Promise<{
  verified: boolean;
  credentialId: string;
  newSignCount: number;
} | null> {
  // Find the credential
  const credId =
    (response as Record<string, string>)?.id ??
    (response as Record<string, string>)?.rawId;
  if (!credId) return null;

  const result = await query<{
    id: string;
    credential_id: string;
    public_key: string;
    sign_count: number;
    transports: string | null;
    user_id: string;
    tenant_id: string;
  }>(
    `SELECT id, credential_id, public_key, sign_count, transports, user_id, tenant_id
     FROM auth_passkeys
     WHERE credential_id = $1 AND deleted_at IS NULL`,
    [credId]
  );

  const passkey = result.rows[0];
  if (!passkey) return null;

  const verification: VerifiedAuthenticationResponse =
    await verifyAuthenticationResponse({
      response: response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge,
      expectedOrigin: authConfig.rpOrigin,
      expectedRPID: authConfig.rpId,
      credential: {
        id: passkey.credential_id,
        publicKey: Buffer.from(passkey.public_key, "base64url"),
        counter: passkey.sign_count,
        transports: passkey.transports
          ? (passkey.transports.split(",") as AuthenticatorTransportFuture[])
          : undefined,
      },
    });

  if (!verification.verified) return null;

  const newSignCount = verification.authenticationInfo.newCounter;
  await query(
    `UPDATE auth_passkeys SET sign_count = $1, last_used_at = now(), updated_at = now() WHERE id = $2`,
    [newSignCount, passkey.id]
  );

  return {
    verified: true,
    credentialId: passkey.credential_id,
    newSignCount,
  };
}

export async function findUserByCredentialId(
  credentialId: string
): Promise<{ userId: string; tenantId: string } | null> {
  const result = await query<{ user_id: string; tenant_id: string }>(
    `SELECT user_id, tenant_id FROM auth_passkeys
     WHERE credential_id = $1 AND deleted_at IS NULL`,
    [credentialId]
  );

  const row = result.rows[0];
  if (!row) return null;
  return { userId: row.user_id, tenantId: row.tenant_id };
}
