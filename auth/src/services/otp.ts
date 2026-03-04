import { randomInt, createHash } from "crypto";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { query } from "../db/pool.ts";
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
  const expiresAt = new Date(Date.now() + authConfig.otpExpiry);

  const result = await query<{ id: string }>(
    `INSERT INTO auth_otp_requests (tenant_id, provider, destination, code_hash, expires_at, max_attempts)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [opts.tenantId, opts.provider, opts.destination, codeHash, expiresAt, authConfig.otpMaxAttempts]
  );

  return { id: result.rows[0]!.id, code };
}

export async function verifyOtp(opts: {
  tenantId: string;
  destination: string;
  code: string;
}): Promise<{ valid: boolean; provider?: "email_otp" | "phone_otp" }> {
  const codeHash = hashCode(opts.code);

  // Find the latest unverified, unexpired OTP for this destination
  const result = await query<{
    id: string;
    provider: "email_otp" | "phone_otp";
    code_hash: string;
    attempts: number;
    max_attempts: number;
  }>(
    `SELECT id, provider, code_hash, attempts, max_attempts
     FROM auth_otp_requests
     WHERE tenant_id = $1
       AND destination = $2
       AND verified_at IS NULL
       AND expires_at > now()
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [opts.tenantId, opts.destination]
  );

  const otp = result.rows[0];
  if (!otp) return { valid: false };

  // Check max attempts
  if (otp.attempts >= otp.max_attempts) {
    return { valid: false };
  }

  // Increment attempts
  await query(
    `UPDATE auth_otp_requests SET attempts = attempts + 1, updated_at = now() WHERE id = $1`,
    [otp.id]
  );

  // Verify hash
  if (otp.code_hash !== codeHash) {
    return { valid: false };
  }

  // Mark as verified
  await query(
    `UPDATE auth_otp_requests SET verified_at = now(), updated_at = now() WHERE id = $1`,
    [otp.id]
  );

  return { valid: true, provider: otp.provider };
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
