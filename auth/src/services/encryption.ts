import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const region = process.env.AWS_REGION || "ap-southeast-1";
const ssmClient = new SSMClient({ region });

let cachedKey: Buffer | null = null;

async function getEncryptionKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  if (process.env.DIRECTORY_ENCRYPTION_KEY) {
    cachedKey = Buffer.from(process.env.DIRECTORY_ENCRYPTION_KEY, "hex");
    return cachedKey;
  }

  const resp = await ssmClient.send(
    new GetParameterCommand({
      Name: "/banyan/auth/directory-encryption-key",
      WithDecryption: true,
    })
  );
  cachedKey = Buffer.from(resp.Parameter!.Value!, "hex");
  return cachedKey;
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: base64(iv + authTag + ciphertext)
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

export async function decryptToken(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Buffer.from(ciphertext, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
