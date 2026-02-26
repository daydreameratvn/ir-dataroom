import { graphql } from "@papaya/graphql/sdk";
import BPromise from "bluebird";
import { fileTypeFromStream } from "file-type";
import got from "got";

import { getClient } from "../../shared/graphql-client.ts";

// ============================================================================
// Types
// ============================================================================

export type ReplacementPII = {
  address?: string;
  citizenId?: string;
  dob?: string;
  email?: string;
  name?: string;
  phone?: string;
  policyNumber?: string;
};

export type ExtractedPII = {
  address?: string | null;
  citizenId?: string | null;
  dob?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  policyNumber?: string | null;
};

export type ClaimDocument = {
  id: string;
  fileUrl: string;
  mimeType: string;
};

export type ProcessedDocument = {
  original: ClaimDocument;
  modified: string | null;
  skipped?: boolean;
  reason?: string;
  replacedFields?: string[];
  replacementPII?: ReplacementPII;
};

// ============================================================================
// GraphQL Queries
// ============================================================================

const ClaimCaseDocumentsForScourge = graphql(`
  query ClaimCaseDocumentsForScourge($where: claim_documents_bool_exp!) {
    claim_documents(where: $where) {
      id
      file { id url }
    }
  }
`);

const InsuredCertificatesCount = graphql(`
  query InsuredCertificatesCount {
    insured_certificates_aggregate(where: { deleted_at: { _is_null: true } }) {
      aggregate { count }
    }
  }
`);

const RandomInsuredCertificate = graphql(`
  query RandomInsuredCertificate($offset: Int!) {
    insured_certificates(where: { deleted_at: { _is_null: true } }, limit: 1, offset: $offset) {
      id
      insured_person { id name paper_id dob email phone address }
      policy_plan { id plan_code plan_name }
    }
  }
`);

// ============================================================================
// Tool Functions
// ============================================================================

export async function fetchClaimDocuments(claimCode: string): Promise<ClaimDocument[]> {
  const client = getClient();
  const { data } = await client.query({
    query: ClaimCaseDocumentsForScourge,
    variables: {
      where: {
        claim_case: { code: { _eq: claimCode } },
        deleted_at: { _is_null: true },
        file: { original_file_id: { _is_null: true } },
        type: { _nin: ["SignOffForm"] },
      },
    },
  });

  const documents = await BPromise.map(
    data?.claim_documents ?? [],
    async (doc) => {
      try {
        if (doc.file?.url == null) return null;
        const fileType = await fileTypeFromStream(got.stream(doc.file.url));
        if (fileType == null) return null;
        if (!fileType.mime.startsWith("image/")) return null;
        return { id: doc.id, fileUrl: doc.file.url, mimeType: fileType.mime };
      } catch {
        return null;
      }
    },
    { concurrency: 5 },
  );

  return documents.filter((d): d is ClaimDocument => d !== null);
}

export async function queryRandomInsured(): Promise<ReplacementPII> {
  const client = getClient();
  const { data: countData } = await client.query({
    query: InsuredCertificatesCount,
    fetchPolicy: "no-cache",
  });
  const totalCount = countData?.insured_certificates_aggregate.aggregate?.count ?? 0;
  if (totalCount === 0) throw new Error("No insured certificates found");

  const randomOffset = Math.floor(Math.random() * totalCount);
  const { data } = await client.query({
    query: RandomInsuredCertificate,
    variables: { offset: randomOffset },
    fetchPolicy: "no-cache",
  });

  const cert = data?.insured_certificates[0];
  if (!cert?.insured_person) throw new Error("Failed to fetch random insured person");

  const person = cert.insured_person;
  return {
    name: person.name ?? undefined,
    citizenId: person.paper_id ?? undefined,
    dob: person.dob ?? undefined,
    email: person.email ?? undefined,
    phone: person.phone ?? undefined,
    address: person.address ?? undefined,
    policyNumber: cert.policy_plan?.plan_code ?? undefined,
  };
}
