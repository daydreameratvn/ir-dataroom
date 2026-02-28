import { describe, it, expect, beforeAll } from "bun:test";
import { randomBytes } from "crypto";
import { encryptToken, decryptToken } from "./encryption.ts";

// Set a test encryption key (32 bytes = 64 hex chars)
beforeAll(() => {
  process.env.DIRECTORY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

describe("encryption", () => {
  it("encrypts and decrypts a token round-trip", async () => {
    const plaintext = "ya29.a0AfH6SMB-test-refresh-token-12345";
    const ciphertext = await encryptToken(plaintext);

    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.length).toBeGreaterThan(0);

    const decrypted = await decryptToken(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (random IV)", async () => {
    const plaintext = "test-token-same-input";
    const c1 = await encryptToken(plaintext);
    const c2 = await encryptToken(plaintext);

    expect(c1).not.toBe(c2);

    // Both should decrypt to the same value
    expect(await decryptToken(c1)).toBe(plaintext);
    expect(await decryptToken(c2)).toBe(plaintext);
  });

  it("handles empty string", async () => {
    const ciphertext = await encryptToken("");
    const decrypted = await decryptToken(ciphertext);
    expect(decrypted).toBe("");
  });

  it("handles long tokens", async () => {
    const longToken = "a".repeat(10000);
    const ciphertext = await encryptToken(longToken);
    const decrypted = await decryptToken(ciphertext);
    expect(decrypted).toBe(longToken);
  });

  it("handles unicode characters", async () => {
    const unicode = "token-with-émojis-🔑-and-中文";
    const ciphertext = await encryptToken(unicode);
    const decrypted = await decryptToken(ciphertext);
    expect(decrypted).toBe(unicode);
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const plaintext = "sensitive-refresh-token";
    const ciphertext = await encryptToken(plaintext);

    // Tamper with the ciphertext
    const bytes = Buffer.from(ciphertext, "base64");
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = bytes.toString("base64");

    expect(decryptToken(tampered)).rejects.toThrow();
  });

  it("fails to decrypt truncated ciphertext", async () => {
    const plaintext = "another-token";
    const ciphertext = await encryptToken(plaintext);

    // Truncate
    const truncated = ciphertext.slice(0, 10);
    expect(decryptToken(truncated)).rejects.toThrow();
  });
});
