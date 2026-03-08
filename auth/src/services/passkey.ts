import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";
import { gqlQuery } from "./gql.ts";
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
  const data = await gqlQuery<{
    authPasskeys: Array<{
      id: string;
      credentialId: string;
      publicKey: string;
      signCount: number;
      transports: string | null;
    }>;
  }>(`
    query GetUserPasskeys($userId: Uuid!, $tenantId: Uuid!) {
      authPasskeys(
        where: { userId: { _eq: $userId }, tenantId: { _eq: $tenantId }, deletedAt: { _is_null: true } }
      ) { id credentialId publicKey signCount transports }
    }
  `, { userId, tenantId });

  return data.authPasskeys;
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
  await gqlQuery(`
    mutation StorePasskey($object: InsertAuthPasskeysObjectInput!) {
      insertAuthPasskeys(objects: [$object]) { affectedRows }
    }
  `, {
    object: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      credentialId: opts.credentialId,
      publicKey: opts.publicKey,
      signCount: opts.signCount,
      deviceName: opts.deviceName ?? null,
      transports: opts.transports ?? null,
    },
  });
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
  const credId =
    (response as Record<string, string>)?.id ??
    (response as Record<string, string>)?.rawId;
  if (!credId) return null;

  const data = await gqlQuery<{
    authPasskeys: Array<{
      id: string;
      credentialId: string;
      publicKey: string;
      signCount: number;
      transports: string | null;
      userId: string;
      tenantId: string;
    }>;
  }>(`
    query FindPasskeyByCredentialId($credId: String1!) {
      authPasskeys(
        where: { credentialId: { _eq: $credId }, deletedAt: { _is_null: true } }
        limit: 1
      ) { id credentialId publicKey signCount transports userId tenantId }
    }
  `, { credId });

  const passkey = data.authPasskeys[0];
  if (!passkey) return null;

  const verification: VerifiedAuthenticationResponse =
    await verifyAuthenticationResponse({
      response: response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge,
      expectedOrigin: authConfig.rpOrigin,
      expectedRPID: authConfig.rpId,
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, "base64url"),
        counter: passkey.signCount,
        transports: passkey.transports
          ? (passkey.transports.split(",") as AuthenticatorTransportFuture[])
          : undefined,
      },
    });

  if (!verification.verified) return null;

  const newSignCount = verification.authenticationInfo.newCounter;
  const now = new Date().toISOString();
  await gqlQuery(`
    mutation UpdatePasskeySignCount($keyId: Uuid!, $updateColumns: UpdateAuthPasskeysByIdUpdateColumnsInput!) {
      updateAuthPasskeysById(keyId: $keyId, updateColumns: $updateColumns) { affectedRows }
    }
  `, {
    keyId: passkey.id,
    updateColumns: {
      signCount: { set: newSignCount },
      lastUsedAt: { set: now },
      updatedAt: { set: now },
    },
  });

  return {
    verified: true,
    credentialId: passkey.credentialId,
    newSignCount,
  };
}

export interface PasskeyInfo {
  id: string;
  credentialId: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listUserPasskeys(
  userId: string,
  tenantId: string
): Promise<PasskeyInfo[]> {
  const data = await gqlQuery<{
    authPasskeys: Array<{
      id: string;
      credentialId: string;
      deviceName: string | null;
      createdAt: string;
      lastUsedAt: string | null;
    }>;
  }>(`
    query ListUserPasskeys($userId: Uuid!, $tenantId: Uuid!) {
      authPasskeys(
        where: { userId: { _eq: $userId }, tenantId: { _eq: $tenantId }, deletedAt: { _is_null: true } }
        order_by: [{ createdAt: Desc }]
      ) { id credentialId deviceName createdAt lastUsedAt }
    }
  `, { userId, tenantId });

  return data.authPasskeys;
}

export async function deletePasskey(
  passkeyId: string,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const data = await gqlQuery<{
    updateAuthPasskeysById: { affectedRows: number };
  }>(`
    mutation DeletePasskey($keyId: Uuid!, $preCheck: AuthPasskeysBoolExp, $updateColumns: UpdateAuthPasskeysByIdUpdateColumnsInput!) {
      updateAuthPasskeysById(keyId: $keyId, preCheck: $preCheck, updateColumns: $updateColumns) {
        affectedRows
      }
    }
  `, {
    keyId: passkeyId,
    preCheck: {
      userId: { _eq: userId },
      tenantId: { _eq: tenantId },
      deletedAt: { _is_null: true },
    },
    updateColumns: {
      deletedAt: { set: now },
      deletedBy: { set: userId },
      updatedAt: { set: now },
      updatedBy: { set: userId },
    },
  });

  return data.updateAuthPasskeysById.affectedRows > 0;
}

export async function renamePasskey(
  passkeyId: string,
  userId: string,
  tenantId: string,
  deviceName: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const data = await gqlQuery<{
    updateAuthPasskeysById: { affectedRows: number };
  }>(`
    mutation RenamePasskey($keyId: Uuid!, $preCheck: AuthPasskeysBoolExp, $updateColumns: UpdateAuthPasskeysByIdUpdateColumnsInput!) {
      updateAuthPasskeysById(keyId: $keyId, preCheck: $preCheck, updateColumns: $updateColumns) {
        affectedRows
      }
    }
  `, {
    keyId: passkeyId,
    preCheck: {
      userId: { _eq: userId },
      tenantId: { _eq: tenantId },
      deletedAt: { _is_null: true },
    },
    updateColumns: {
      deviceName: { set: deviceName },
      updatedAt: { set: now },
      updatedBy: { set: userId },
    },
  });

  return data.updateAuthPasskeysById.affectedRows > 0;
}

export async function findUserByCredentialId(
  credentialId: string
): Promise<{ userId: string; tenantId: string } | null> {
  const data = await gqlQuery<{
    authPasskeys: Array<{ userId: string; tenantId: string }>;
  }>(`
    query FindUserByCredentialId($credentialId: String1!) {
      authPasskeys(
        where: { credentialId: { _eq: $credentialId }, deletedAt: { _is_null: true } }
        limit: 1
      ) { userId tenantId }
    }
  `, { credentialId });

  return data.authPasskeys[0] ?? null;
}
