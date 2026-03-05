import { randomInt, createHash } from "crypto";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { gqlQuery } from "./gql.ts";
import { authConfig } from "../config.ts";

const region = process.env.AWS_REGION || "ap-southeast-1";
const sesClient = new SESClient({ region });
const snsClient = new SNSClient({ region });

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

export async function createOtpRequest(opts: {
  tenantId: string;
  provider: "email_otp" | "phone_otp";
  destination: string;
}): Promise<{ id: string; code: string }> {
  const code = generateOtp();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + authConfig.otpExpiry).toISOString();

  const data = await gqlQuery<{
    insertAuthOtpRequests: { returning: Array<{ id: string }> };
  }>(`
    mutation InsertOtpRequest($object: InsertAuthOtpRequestsObjectInput!) {
      insertAuthOtpRequests(objects: [$object]) {
        returning { id }
      }
    }
  `, {
    object: {
      tenantId: opts.tenantId,
      provider: opts.provider,
      destination: opts.destination,
      codeHash,
      expiresAt,
      maxAttempts: authConfig.otpMaxAttempts,
    },
  });

  return { id: data.insertAuthOtpRequests.returning[0]!.id, code };
}

export async function verifyOtp(opts: {
  tenantId: string;
  destination: string;
  code: string;
}): Promise<{ valid: boolean; provider?: "email_otp" | "phone_otp" }> {
  const codeHash = hashCode(opts.code);
  const now = new Date().toISOString();

  // Find the latest unverified, unexpired OTP for this destination
  const data = await gqlQuery<{
    authOtpRequests: Array<{
      id: string;
      provider: string;
      codeHash: string;
      attempts: number;
      maxAttempts: number;
    }>;
  }>(`
    query FindLatestOtp($tenantId: Uuid!, $destination: String1!, $now: Timestamptz!) {
      authOtpRequests(
        where: {
          tenantId: { _eq: $tenantId }
          destination: { _eq: $destination }
          verifiedAt: { _is_null: true }
          expiresAt: { _gt: $now }
          deletedAt: { _is_null: true }
        }
        order_by: { createdAt: Desc }
        limit: 1
      ) {
        id
        provider
        codeHash
        attempts
        maxAttempts
      }
    }
  `, { tenantId: opts.tenantId, destination: opts.destination, now });

  const otp = data.authOtpRequests[0];
  if (!otp) return { valid: false };

  // Check max attempts
  if (otp.attempts >= otp.maxAttempts) {
    return { valid: false };
  }

  // Increment attempts (no atomic increment in DDN — read + write)
  const updatedAt = new Date().toISOString();
  await gqlQuery(`
    mutation IncrementOtpAttempts($id: Uuid!, $attempts: Int32!, $updatedAt: Timestamptz!) {
      updateAuthOtpRequestsById(
        keyId: $id
        updateColumns: {
          attempts: { set: $attempts }
          updatedAt: { set: $updatedAt }
        }
      ) { affectedRows }
    }
  `, { id: otp.id, attempts: otp.attempts + 1, updatedAt });

  // Verify hash
  if (otp.codeHash !== codeHash) {
    return { valid: false };
  }

  // Mark as verified
  const verifiedAt = new Date().toISOString();
  await gqlQuery(`
    mutation VerifyOtp($id: Uuid!, $verifiedAt: Timestamptz!) {
      updateAuthOtpRequestsById(
        keyId: $id
        updateColumns: {
          verifiedAt: { set: $verifiedAt }
          updatedAt: { set: $verifiedAt }
        }
      ) { affectedRows }
    }
  `, { id: otp.id, verifiedAt });

  return { valid: true, provider: otp.provider as "email_otp" | "phone_otp" };
}

export async function sendEmailOtp(email: string, code: string): Promise<void> {
  const fromEmail = process.env.OTP_FROM_EMAIL || "noreply@papaya.asia";

  await sesClient.send(
    new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: `Your Papaya sign-in code: ${code}` },
        Body: {
          Text: {
            Data: `Your sign-in code is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.\n\nPapaya`,
          },
          Html: {
            Data: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #333;">
                <div style="text-align: center; margin-bottom: 28px;">
                  <img src="https://investors.papaya.asia/papaya-logo.png" alt="Papaya" height="36" style="height: 36px;" />
                </div>
                <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 8px; text-align: center;">Here\u2019s your sign-in code</h2>
                <p style="color: #666; font-size: 14px; text-align: center; margin: 0 0 28px;">Enter this code to access the dataroom:</p>
                <div style="background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; text-align: center; margin: 0 0 20px;">
                  <span style="font-family: 'Courier New', Courier, monospace; font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #1a1a1a; user-select: all; -webkit-user-select: all; -moz-user-select: all;">${code}</span>
                </div>
                <p style="color: #999; font-size: 12px; text-align: center; margin: 0 0 28px;">Click the code to select it, then copy \u2022 Expires in 10 minutes</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 0 0 16px;" />
                <p style="color: #aaa; font-size: 11px; text-align: center; line-height: 1.5; margin: 0;">
                  If you didn\u2019t request this code, you can safely ignore this email.<br />
                  Papaya \u2022 Confidential
                </p>
              </div>
            `,
          },
        },
      },
    })
  );
}

export async function sendSmsOtp(phone: string, code: string): Promise<void> {
  await snsClient.send(
    new PublishCommand({
      PhoneNumber: phone,
      Message: `Your Papaya verification code is: ${code}. Expires in 10 minutes.`,
      MessageAttributes: {
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: "Transactional",
        },
      },
    })
  );
}
