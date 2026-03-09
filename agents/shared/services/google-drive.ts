import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { google, type drive_v3 } from "googleapis";
import { GoogleAuth } from "google-auth-library";
// pdf-parse v2 has no default ESM export; use require() for Bun compat
const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");

// ============================================================================
// Constants
// ============================================================================

const DRIVE_POLICY_ROOT_ID = process.env.DRIVE_POLICY_ROOT_ID ?? "1HeLlO86_ZlhtQJCWy9NK_zSk7aOoghuZ";
const SSM_KEY_PATH = "/banyan/drive/service-account-key";
const AWS_REGION = "ap-southeast-1";
const MAX_PDF_TEXT_LENGTH = 100_000;

// Cache TTLs
const FOLDER_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PDF_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Known document category folder names (Vietnamese)
const CATEGORY_PATTERNS: Record<string, RegExp> = {
  contracts: /h[oợ]p\s*[đd][oồ]ng/i,
  terms_and_conditions: /quy\s*t[aắ][cể]|t[&]c|điều\s*khoản/i,
  amendments: /s[uử]a\s*[đd][oổ]i|b[oổ]\s*sung|ph[uụ]\s*l[uụ]c/i,
  member_lists: /danh\s*s[aá]ch/i,
  blacklists: /black\s*list|danh\s*s[aá]ch\s*[đd]en/i,
};

// ============================================================================
// Types
// ============================================================================

export interface PolicyFile {
  id: string;
  name: string;
  mimeType: string;
  size: string | null;
  category: string;
  modifiedTime: string | null;
}

export interface PolicyDocSearchResult {
  insurerName: string;
  companyName: string | null;
  policyNumber: string | null;
  matchedPath: string[];
  files: PolicyFile[];
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ============================================================================
// In-memory Cache
// ============================================================================

const folderCache = new Map<string, CacheEntry<drive_v3.Schema$File[]>>();
const pdfTextCache = new Map<string, CacheEntry<string>>();

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ============================================================================
// Drive Client Singleton
// ============================================================================

let driveClient: drive_v3.Drive | null = null;

async function getDriveClient(): Promise<drive_v3.Drive> {
  if (driveClient) return driveClient;

  const ssmClient = new SSMClient({ region: AWS_REGION });
  const resp = await ssmClient.send(
    new GetParameterCommand({ Name: SSM_KEY_PATH, WithDecryption: true }),
  );
  const keyJson = resp.Parameter?.Value;
  if (!keyJson) throw new Error(`SSM parameter ${SSM_KEY_PATH} not found or empty`);

  const credentials = JSON.parse(keyJson);
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

// ============================================================================
// Vietnamese Name Normalization
// ============================================================================

const DIACRITICS_MAP: Record<string, string> = {
  à: "a", á: "a", ả: "a", ã: "a", ạ: "a",
  ă: "a", ằ: "a", ắ: "a", ẳ: "a", ẵ: "a", ặ: "a",
  â: "a", ầ: "a", ấ: "a", ẩ: "a", ẫ: "a", ậ: "a",
  è: "e", é: "e", ẻ: "e", ẽ: "e", ẹ: "e",
  ê: "e", ề: "e", ế: "e", ể: "e", ễ: "e", ệ: "e",
  ì: "i", í: "i", ỉ: "i", ĩ: "i", ị: "i",
  ò: "o", ó: "o", ỏ: "o", õ: "o", ọ: "o",
  ô: "o", ồ: "o", ố: "o", ổ: "o", ỗ: "o", ộ: "o",
  ơ: "o", ờ: "o", ớ: "o", ở: "o", ỡ: "o", ợ: "o",
  ù: "u", ú: "u", ủ: "u", ũ: "u", ụ: "u",
  ư: "u", ừ: "u", ứ: "u", ử: "u", ữ: "u", ự: "u",
  ỳ: "y", ý: "y", ỷ: "y", ỹ: "y", ỵ: "y",
  đ: "d",
  // uppercase
  À: "a", Á: "a", Ả: "a", Ã: "a", Ạ: "a",
  Ă: "a", Ằ: "a", Ắ: "a", Ẳ: "a", Ẵ: "a", Ặ: "a",
  Â: "a", Ầ: "a", Ấ: "a", Ẩ: "a", Ẫ: "a", Ậ: "a",
  È: "e", É: "e", Ẻ: "e", Ẽ: "e", Ẹ: "e",
  Ê: "e", Ề: "e", Ế: "e", Ể: "e", Ễ: "e", Ệ: "e",
  Ì: "i", Í: "i", Ỉ: "i", Ĩ: "i", Ị: "i",
  Ò: "o", Ó: "o", Ỏ: "o", Õ: "o", Ọ: "o",
  Ô: "o", Ồ: "o", Ố: "o", Ổ: "o", Ỗ: "o", Ộ: "o",
  Ơ: "o", Ờ: "o", Ớ: "o", Ở: "o", Ỡ: "o", Ợ: "o",
  Ù: "u", Ú: "u", Ủ: "u", Ũ: "u", Ụ: "u",
  Ư: "u", Ừ: "u", Ứ: "u", Ử: "u", Ữ: "u", Ự: "u",
  Ỳ: "y", Ý: "y", Ỷ: "y", Ỹ: "y", Ỵ: "y",
  Đ: "d",
};

export function normalizeVietnamese(str: string): string {
  return str
    .split("")
    .map((ch) => DIACRITICS_MAP[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function fuzzyMatch(folderName: string, searchName: string): boolean {
  const normalizedFolder = normalizeVietnamese(folderName);
  const normalizedSearch = normalizeVietnamese(searchName);
  // Exact normalized match or one contains the other
  return normalizedFolder === normalizedSearch
    || normalizedFolder.includes(normalizedSearch)
    || normalizedSearch.includes(normalizedFolder);
}

// ============================================================================
// Drive Folder Operations
// ============================================================================

async function listChildren(drive: drive_v3.Drive, folderId: string): Promise<drive_v3.Schema$File[]> {
  const cacheKey = `children:${folderId}`;
  const cached = getCached(folderCache, cacheKey);
  if (cached) return cached;

  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;

  do {
    const resp = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime)",
      pageSize: 1000,
      pageToken,
    });
    if (resp.data.files) files.push(...resp.data.files);
    pageToken = resp.data.nextPageToken ?? undefined;
  } while (pageToken);

  setCached(folderCache, cacheKey, files, FOLDER_CACHE_TTL_MS);
  return files;
}

function findMatchingFolder(items: drive_v3.Schema$File[], name: string): drive_v3.Schema$File | null {
  const isFolder = (f: drive_v3.Schema$File) => f.mimeType === "application/vnd.google-apps.folder";
  const folders = items.filter(isFolder);

  // 1. Exact name match (case-insensitive)
  const exact = folders.find((f) => f.name?.toLowerCase() === name.toLowerCase());
  if (exact) return exact;

  // 2. Fuzzy Vietnamese match
  const fuzzy = folders.find((f) => f.name != null && fuzzyMatch(f.name, name));
  if (fuzzy) return fuzzy;

  return null;
}

function categorizeFile(file: drive_v3.Schema$File, parentName: string): string {
  // Check parent folder name against known categories
  for (const [category, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    if (pattern.test(parentName)) return category;
  }
  // Fall back to checking the file name itself
  for (const [category, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    if (file.name != null && pattern.test(file.name)) return category;
  }
  return "other";
}

async function collectFilesRecursive(
  drive: drive_v3.Drive,
  folderId: string,
  parentName: string,
): Promise<PolicyFile[]> {
  const children = await listChildren(drive, folderId);
  const results: PolicyFile[] = [];

  for (const child of children) {
    if (child.mimeType === "application/vnd.google-apps.folder") {
      const subFiles = await collectFilesRecursive(drive, child.id!, child.name ?? "unknown");
      results.push(...subFiles);
    } else {
      results.push({
        id: child.id!,
        name: child.name ?? "unknown",
        mimeType: child.mimeType ?? "unknown",
        size: child.size ?? null,
        category: categorizeFile(child, parentName),
        modifiedTime: child.modifiedTime ?? null,
      });
    }
  }

  return results;
}

// ============================================================================
// Public API
// ============================================================================

export async function listInsurerFolderNames(): Promise<string[]> {
  const drive = await getDriveClient();
  const children = await listChildren(drive, DRIVE_POLICY_ROOT_ID);
  return children
    .filter(f => f.mimeType === "application/vnd.google-apps.folder")
    .map(f => f.name!)
    .filter(Boolean);
}

export async function listPolicyDocuments(params: {
  insurerName: string;
  companyName?: string;
  policyNumber?: string;
}): Promise<PolicyDocSearchResult> {
  const drive = await getDriveClient();
  const matchedPath: string[] = [];

  // Step 1: Find insurer folder in root
  const rootChildren = await listChildren(drive, DRIVE_POLICY_ROOT_ID);
  const insurerFolder = findMatchingFolder(rootChildren, params.insurerName);
  if (!insurerFolder) {
    const folderNames = rootChildren
      .filter((f) => f.mimeType === "application/vnd.google-apps.folder")
      .map((f) => f.name);
    throw new Error(
      `Insurer "${params.insurerName}" not found in Drive. Available folders: ${folderNames.join(", ")}`,
    );
  }
  matchedPath.push(insurerFolder.name!);

  // Step 2: Navigate to company (with branch-level fallback)
  let targetFolderId = insurerFolder.id!;

  if (params.companyName) {
    const insurerChildren = await listChildren(drive, insurerFolder.id!);
    const companyFolder = findMatchingFolder(insurerChildren, params.companyName);

    if (companyFolder) {
      targetFolderId = companyFolder.id!;
      matchedPath.push(companyFolder.name!);
    } else {
      // Try one level deeper — some insurers have branch subfolders
      let found = false;
      const branchFolders = insurerChildren.filter(
        (f) => f.mimeType === "application/vnd.google-apps.folder",
      );
      for (const branch of branchFolders) {
        const branchChildren = await listChildren(drive, branch.id!);
        const companyInBranch = findMatchingFolder(branchChildren, params.companyName);
        if (companyInBranch) {
          targetFolderId = companyInBranch.id!;
          matchedPath.push(branch.name!, companyInBranch.name!);
          found = true;
          break;
        }
      }
      if (!found) {
        const folderNames = insurerChildren
          .filter((f) => f.mimeType === "application/vnd.google-apps.folder")
          .map((f) => f.name);
        throw new Error(
          `Company "${params.companyName}" not found under insurer "${insurerFolder.name}". Available folders: ${folderNames.join(", ")}`,
        );
      }
    }
  }

  // Step 3: Navigate to policy number subfolder (if given)
  if (params.policyNumber) {
    const children = await listChildren(drive, targetFolderId);
    const policyFolder = findMatchingFolder(children, params.policyNumber);
    if (policyFolder) {
      targetFolderId = policyFolder.id!;
      matchedPath.push(policyFolder.name!);
    }
    // If not found, stay at company folder — some insurers don't have this level
  }

  // Step 4: Collect all files recursively and categorize
  const files = await collectFilesRecursive(drive, targetFolderId, matchedPath.at(-1) ?? "root");

  return {
    insurerName: insurerFolder.name!,
    companyName: params.companyName ?? null,
    policyNumber: params.policyNumber ?? null,
    matchedPath,
    files,
  };
}

export async function extractPdfText(fileId: string): Promise<string> {
  // Check cache first
  const cached = getCached(pdfTextCache, fileId);
  if (cached) return cached;

  const drive = await getDriveClient();

  // Download PDF content
  const resp = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );

  const buffer = Buffer.from(resp.data as ArrayBuffer);
  const parser = new PDFParse({ data: buffer });
  await parser.load();
  const parsed = await parser.getText();
  const text = parsed.text.slice(0, MAX_PDF_TEXT_LENGTH);

  setCached(pdfTextCache, fileId, text, PDF_CACHE_TTL_MS);
  return text;
}
