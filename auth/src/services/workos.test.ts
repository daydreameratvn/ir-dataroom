import { describe, test, expect, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Mock AWS SDK and WorkOS SDK before importing the module under test
// ---------------------------------------------------------------------------

const mockSend = mock(() =>
  Promise.resolve({ Parameter: { Value: "mocked-ssm-value" } }),
);

mock.module("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    send = mockSend;
  },
  GetParameterCommand: class {
    Name: string;
    constructor(input: { Name: string; WithDecryption: boolean }) {
      this.Name = input.Name;
    }
  },
}));

mock.module("@workos-inc/node", () => ({
  WorkOS: class {
    constructor(public apiKey: string) {}
    userManagement = {};
  },
}));

const {
  getWorkOSClient,
  getWorkOSClientId,
  getWorkOSRedirectUri,
} = await import("./workos.ts");

describe("getWorkOSRedirectUri", () => {
  test("returns a URL ending with /auth/workos/callback", () => {
    const uri = getWorkOSRedirectUri();
    expect(uri).toEndWith("/auth/workos/callback");
  });

  test("returns an absolute URL with protocol", () => {
    const uri = getWorkOSRedirectUri();
    expect(uri).toMatch(/^https?:\/\//);
  });
});

describe("getWorkOSClient", () => {
  test("returns a WorkOS client instance", async () => {
    process.env.WORKOS_API_KEY = "sk_test_key";
    const client = await getWorkOSClient();
    expect(client).toBeDefined();
    expect(client).toHaveProperty("userManagement");
  });

});

describe("getWorkOSClientId", () => {
  test("returns a string client ID", async () => {
    process.env.WORKOS_CLIENT_ID = "client_test_from_env";
    const clientId = await getWorkOSClientId();
    expect(typeof clientId).toBe("string");
    expect(clientId.length).toBeGreaterThan(0);
  });

  test("caches the client ID on subsequent calls", async () => {
    const id1 = await getWorkOSClientId();
    const id2 = await getWorkOSClientId();
    expect(id1).toBe(id2);
  });
});
