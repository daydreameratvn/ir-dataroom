import type {
  PhoenixConfig,
  PhoenixEnvironment,
  LoginResult,
  Claim,
  ClaimDetail,
  ClaimDocument,
  CreateClaimInput,
  UploadDocumentInput,
  UploadDocumentResult,
} from './types';

// ── Environment → GraphQL endpoint resolution ──

const GRAPHQL_ENDPOINTS: Record<PhoenixEnvironment, string> = {
  production: 'https://banyan.services.papaya.asia/graphql',
  staging: 'https://staging.banyan.services.papaya.asia/graphql',
  uat: 'https://uat.banyan.services.papaya.asia/graphql',
  development: 'http://localhost:3280/graphql',
};

// ── GraphQL field selections (matches Hasura DDN schema) ──

const CLAIM_FIELDS = `
  id claimNumber status policyId
  claimantName providerName
  amountClaimed amountApproved amountPaid currency
  dateOfLoss dateOfService
  aiSummary aiRecommendation
  createdAt updatedAt
`;

const CLAIM_DOCUMENT_FIELDS = `
  id claimId
  fileName fileType fileUrl fileSizeBytes
  documentType
  createdAt
`;

const CLAIM_NOTE_FIELDS = `
  id claimId
  agentName content noteType
  createdAt
`;

export class PhoenixClient {
  private graphqlUrl: string;
  private timeout: number;
  private token: string | null = null;
  private tenantId: string | null = null;

  constructor(config: PhoenixConfig) {
    const url = config.graphqlUrl ?? GRAPHQL_ENDPOINTS[config.environment];
    this.graphqlUrl = url.replace(/\/$/, '');
    this.timeout = config.timeout ?? 30_000;
  }

  setToken(token: string): void {
    this.token = token;
  }

  setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Auth operations (GraphQL mutations → Hasura DDN commands → auth service)
  // ═══════════════════════════════════════════════════════════════════════════

  async login(policyNumbers: string[]): Promise<LoginResult[]> {
    const data = await this.gql<{ phoenixLogin: { results: LoginResult[] } }>(
      `mutation PhoenixLogin($policyNumbers: [String!]!) {
        phoenixLogin(policyNumbers: $policyNumbers) {
          results {
            policyNumber success message token
            policy { id policyNumber insuredName status }
          }
        }
      }`,
      { policyNumbers },
    );
    return data.phoenixLogin.results;
  }

  async refreshToken(): Promise<{ token: string }> {
    const data = await this.gql<{ phoenixRefreshToken: { token: string } }>(
      `mutation PhoenixRefreshToken {
        phoenixRefreshToken { token }
      }`,
    );
    return data.phoenixRefreshToken;
  }

  async requestOtp(claimId: string): Promise<{ success: boolean }> {
    const data = await this.gql<{ phoenixRequestOtp: { success: boolean } }>(
      `mutation PhoenixRequestOtp($claimId: Uuid!) {
        phoenixRequestOtp(claimId: $claimId) { success }
      }`,
      { claimId },
    );
    return data.phoenixRequestOtp;
  }

  async verifyOtp(claimId: string, code: string): Promise<{ success: boolean; verified: boolean }> {
    const data = await this.gql<{ phoenixVerifyOtp: { success: boolean; verified: boolean } }>(
      `mutation PhoenixVerifyOtp($claimId: Uuid!, $code: String!) {
        phoenixVerifyOtp(claimId: $claimId, code: $code) { success verified }
      }`,
      { claimId, code },
    );
    return data.phoenixVerifyOtp;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Data operations (GraphQL queries/mutations → Hasura DDN)
  // ═══════════════════════════════════════════════════════════════════════════

  async listClaims(): Promise<Claim[]> {
    const data = await this.gql<{ claims: RawClaim[] }>(
      `query ListClaims($where: ClaimsBoolExp!) {
        claims(where: $where, order_by: [{ createdAt: Desc }]) {
          ${CLAIM_FIELDS}
        }
      }`,
      {
        where: {
          deletedAt: { _is_null: true },
        },
      },
    );
    return data.claims.map(mapClaim);
  }

  async getClaim(claimId: string): Promise<ClaimDetail> {
    const data = await this.gql<{ claimsById: RawClaimDetail | null }>(
      `query GetClaimDetail($id: Uuid!) {
        claimsById(id: $id) {
          ${CLAIM_FIELDS}
          claimDocuments(
            where: { deletedAt: { _is_null: true } }
            order_by: [{ createdAt: Desc }]
          ) {
            ${CLAIM_DOCUMENT_FIELDS}
          }
          claimNotes(
            where: { visibility: { _eq: "external" }, deletedAt: { _is_null: true } }
            order_by: [{ createdAt: Desc }]
          ) {
            ${CLAIM_NOTE_FIELDS}
          }
        }
      }`,
      { id: claimId },
    );

    const raw = data.claimsById;
    if (!raw) throw new Error(`Claim ${claimId} not found`);

    return {
      ...mapClaim(raw),
      documents: raw.claimDocuments.map(mapDocument),
      notes: raw.claimNotes.map(mapNote),
      aiSummary: raw.aiSummary ?? null,
      aiRecommendation: raw.aiRecommendation ?? null,
    };
  }

  async submitClaim(input: CreateClaimInput): Promise<Claim> {
    const claimNumber = `CLM-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const data = await this.gql<{ insertClaims: { returning: RawClaim[] } }>(
      `mutation CreateClaim($objects: [ClaimsInsertInput!]!) {
        insertClaims(objects: $objects) {
          returning {
            ${CLAIM_FIELDS}
          }
        }
      }`,
      {
        objects: [
          {
            claimNumber,
            status: 'submitted',
            claimantName: input.claimantName,
            providerName: input.providerName ?? null,
            amountClaimed: input.amountClaimed,
            currency: input.currency ?? 'VND',
            dateOfLoss: input.dateOfLoss ?? null,
            dateOfService: input.dateOfService ?? null,
          },
        ],
      },
    );

    return mapClaim(data.insertClaims.returning[0]!);
  }

  async uploadDocument(claimId: string, input: UploadDocumentInput): Promise<UploadDocumentResult> {
    const data = await this.gql<{ phoenixUploadDocument: { uploadUrl: string; document: RawDocument } }>(
      `mutation PhoenixUploadDocument($claimId: Uuid!, $fileName: String!, $fileType: String!, $documentType: String) {
        phoenixUploadDocument(claimId: $claimId, fileName: $fileName, fileType: $fileType, documentType: $documentType) {
          uploadUrl
          document { ${CLAIM_DOCUMENT_FIELDS} }
        }
      }`,
      { claimId, ...input },
    );
    return {
      uploadUrl: data.phoenixUploadDocument.uploadUrl,
      document: mapDocument(data.phoenixUploadDocument.document),
    };
  }

  async getClaimDocuments(claimId: string): Promise<ClaimDocument[]> {
    const data = await this.gql<{ claimDocuments: RawDocument[] }>(
      `query GetClaimDocuments($where: ClaimDocumentsBoolExp!) {
        claimDocuments(where: $where, order_by: [{ createdAt: Desc }]) {
          ${CLAIM_DOCUMENT_FIELDS}
        }
      }`,
      {
        where: {
          claimId: { _eq: claimId },
          deletedAt: { _is_null: true },
        },
      },
    );
    return data.claimDocuments.map(mapDocument);
  }

  async deleteDocument(claimId: string, documentId: string): Promise<{ success: boolean }> {
    await this.gql<{ updateClaimDocumentsById: { returning: { id: string }[] } }>(
      `mutation SoftDeleteDocument($keyId: Uuid!, $updateColumns: UpdateClaimDocumentsByIdUpdateColumns!) {
        updateClaimDocumentsById(keyId: $keyId, updateColumns: $updateColumns) {
          returning { id }
        }
      }`,
      {
        keyId: documentId,
        updateColumns: {
          deletedAt: new Date().toISOString(),
        },
      },
    );
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Transport
  // ═══════════════════════════════════════════════════════════════════════════

  /** Execute a GraphQL query/mutation against Hasura DDN. */
  private async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (this.tenantId) {
      headers['x-tenant-id'] = this.tenantId;
    }

    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        throw new Error(`Phoenix GraphQL error: ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
      if (json.errors?.length) {
        throw new Error(`Phoenix GraphQL error: ${json.errors[0]!.message}`);
      }
      return json.data as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ── Raw GraphQL response types (Hasura returns Bigdecimal as string) ──

interface RawClaim {
  id: string;
  claimNumber: string;
  status: string;
  policyId: string;
  claimantName: string | null;
  providerName: string | null;
  amountClaimed: string | null;
  amountApproved: string | null;
  amountPaid: string | null;
  currency: string | null;
  dateOfLoss: string | null;
  dateOfService: string | null;
  aiSummary: string | null;
  aiRecommendation: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawClaimDetail extends RawClaim {
  claimDocuments: RawDocument[];
  claimNotes: RawNote[];
}

interface RawDocument {
  id: string;
  claimId: string;
  fileName: string;
  fileType: string | null;
  fileUrl: string | null;
  fileSizeBytes: string | null;
  documentType: string | null;
  createdAt: string;
}

interface RawNote {
  id: string;
  claimId: string;
  agentName: string | null;
  content: string;
  noteType: string;
  createdAt: string;
}

// ── Mappers (Hasura Bigdecimal → number, field name normalization) ──

function toNumber(val: string | null): number {
  if (val === null || val === undefined) return 0;
  return Number(val);
}

function toNumberOrNull(val: string | null): number | null {
  if (val === null || val === undefined) return null;
  return Number(val);
}

function mapClaim(raw: RawClaim): Claim {
  return {
    id: raw.id,
    claimNumber: raw.claimNumber,
    status: raw.status,
    claimantName: raw.claimantName ?? '',
    providerName: raw.providerName,
    amountClaimed: toNumber(raw.amountClaimed),
    amountApproved: toNumberOrNull(raw.amountApproved),
    amountPaid: toNumberOrNull(raw.amountPaid),
    currency: raw.currency ?? 'VND',
    dateOfLoss: raw.dateOfLoss,
    dateOfService: raw.dateOfService,
    createdAt: raw.createdAt,
  };
}

function mapDocument(raw: RawDocument): ClaimDocument {
  return {
    id: raw.id,
    fileName: raw.fileName,
    fileType: raw.fileType,
    fileUrl: raw.fileUrl ?? '',
    fileSizeBytes: toNumberOrNull(raw.fileSizeBytes),
    documentType: raw.documentType,
    createdAt: raw.createdAt,
  };
}

function mapNote(raw: RawNote): import('./types').ClaimNote {
  return {
    id: raw.id,
    content: raw.content,
    noteType: raw.noteType,
    agentName: raw.agentName,
    createdAt: raw.createdAt,
  };
}
