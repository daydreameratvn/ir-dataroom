/**
 * Per-market forensics configuration.
 *
 * Each market defines OCR languages, Gemini prompt language, field
 * classification regex rules, and name-detection heuristics.
 *
 * Default market is VN (Vietnam) for backward compatibility.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type MarketCode = 'VN' | 'TH' | 'HK' | 'ID';

export interface MarketFieldRule {
  re: RegExp;
  /** Must match a value from FIELD_TYPES in ./types.ts */
  label: string;
}

export interface MarketConfig {
  code: MarketCode;
  /** EasyOCR language codes, e.g. ['vi', 'en'] */
  ocrLangs: string[];
  /** Language name injected into the Gemini system prompt */
  promptLanguage: string;
  /** Priority-ordered regex rules — first match wins */
  fieldRules: MarketFieldRule[];
  /** Title-case name heuristic with market-appropriate diacritics */
  titleCaseNameRe: RegExp;
  /** ALL-CAPS name heuristic with market-appropriate diacritics */
  allCapsNameRe: RegExp;
}

export const DEFAULT_MARKET: MarketCode = 'VN';

const VALID_MARKETS = new Set<string>(['VN', 'TH', 'HK', 'ID']);

/**
 * Resolve a raw market string to a valid MarketCode.
 * Returns DEFAULT_MARKET when input is missing or unrecognized.
 */
export function resolveMarket(raw: string | undefined | null): MarketCode {
  if (!raw) return DEFAULT_MARKET;
  const upper = raw.trim().toUpperCase();
  if (VALID_MARKETS.has(upper)) return upper as MarketCode;
  return DEFAULT_MARKET;
}

// ── Shared rules (language-agnostic) ─────────────────────────────────────────

const SHARED_RULES: MarketFieldRule[] = [
  // ICD-10 codes (uppercase letter + 2 digits + optional decimal)
  { re: /\b[A-Z]\d{2}(?:\.\d+)?\b/, label: 'diagnosis' },
  // Generic date patterns
  { re: /\b\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}\b/, label: 'date' },
  { re: /\b\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}\b/, label: 'date' },
  // ID_NUMBER — 9–12 bare digits
  { re: /\b\d{9,12}\b/, label: 'id_number' },
  // Generic currency symbols
  { re: /[₫$€£¥]\s*\d[\d,.]*/, label: 'amount' },
  // Thousand-separated amounts (1,000,000 or 1.000.000)
  { re: /\d{1,3}(?:[.,]\d{3})+/, label: 'amount' },
];

// ── Vietnam (VN) ─────────────────────────────────────────────────────────────

const VN_RULES: MarketFieldRule[] = [
  // INSURANCE_ID — specific prefixes
  { re: /\b(?:BHXH|BVNT|MBAL|HSC|AIA|PRU|PTI|BH|BN|HN)[A-Z0-9\-]{3,}/i, label: 'insurance_id' },
  { re: /\b(GB|GD|HC|TE|HN|HT)\s*\d[\d\s]{6,}\b/i, label: 'insurance_id' },
  { re: /mã\s*(thẻ|số)\s*bhyt/i, label: 'insurance_id' },

  // AMOUNT — Vietnamese currency
  { re: /[₫$€£¥]\s*\d[\d,.]*/, label: 'amount' },
  { re: /\d[\d,.]*\s*(?:đồng|vnd|vnđ|đ|₫|triệu|nghìn)\b/i, label: 'amount' },
  { re: /\d{1,3}(?:[.,]\d{3})+/, label: 'amount' },
  { re: /tổng\s*(số\s*)?(tiền|chi\s*phí)/i, label: 'amount' },

  // DIAGNOSIS
  { re: /chẩn\s*đoán/i, label: 'diagnosis' },
  { re: /\b[A-Z]\d{2}(?:\.\d+)?\b/, label: 'diagnosis' },

  // ID_NUMBER
  { re: /\b\d{9,12}\b/, label: 'id_number' },
  { re: /mã\s*(y\s*tế|số\s*người\s*bệnh|bệnh\s*nhân)/i, label: 'id_number' },
  { re: /số\s*(khám|lưu\s*trữ|hồ\s*sơ)/i, label: 'id_number' },

  // DATE
  { re: /\b\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}\b/, label: 'date' },
  { re: /\b\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}\b/, label: 'date' },
  { re: /ngày\s+\d{1,2}\s+tháng/i, label: 'date' },
  { re: /\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}/i, label: 'date' },

  // DOCTOR_NAME
  { re: /\b(?:bác?\s*sĩ|bs\.|dr\.?|ths\.?)\b/i, label: 'doctor_name' },

  // HOSPITAL_NAME
  { re: /bệnh\s*viện/i, label: 'hospital_name' },
  { re: /phòng\s*khám/i, label: 'hospital_name' },

  // PATIENT_NAME — label prefix
  { re: /họ\s*(tên|và\s*tên)\s*(người\s*bệnh)?\s*:/i, label: 'patient_name' },
];

// ── Thailand (TH) ────────────────────────────────────────────────────────────

const TH_RULES: MarketFieldRule[] = [
  // INSURANCE_ID — Thai insurance prefixes
  { re: /\b(?:สปสช|ประกัน|กรมธรรม์)\s*[ก-๙A-Z0-9\-]{3,}/i, label: 'insurance_id' },
  { re: /\b(?:HN|AN|VN)\s*\d[\d\s]{4,}\b/i, label: 'insurance_id' },

  // AMOUNT — Thai Baht
  { re: /[₫$€£¥฿]\s*\d[\d,.]*/, label: 'amount' },
  { re: /\d[\d,.]*\s*(?:บาท|baht|฿)\b/i, label: 'amount' },
  { re: /\d{1,3}(?:[.,]\d{3})+/, label: 'amount' },
  { re: /(?:รวม|ยอด)\s*(?:เงิน|ทั้งหมด|สุทธิ)/i, label: 'amount' },

  // DIAGNOSIS
  { re: /(?:การ)?วินิจฉัย|โรค/i, label: 'diagnosis' },
  { re: /\b[A-Z]\d{2}(?:\.\d+)?\b/, label: 'diagnosis' },

  // ID_NUMBER — Thai national ID (13 digits)
  { re: /\b\d{1}\s*\d{4}\s*\d{5}\s*\d{2}\s*\d{1}\b/, label: 'id_number' },
  { re: /\b\d{9,13}\b/, label: 'id_number' },
  { re: /(?:เลข(?:ที่)?|หมาย(?:เลข)?)\s*(?:ผู้ป่วย|บัตร|ประชาชน)/i, label: 'id_number' },

  // DATE — Buddhist Era (พ.ศ.) and standard
  { re: /\b\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}\b/, label: 'date' },
  { re: /\b\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}\b/, label: 'date' },
  { re: /\d{1,2}\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*\d{2,4}/, label: 'date' },
  { re: /วันที่\s*\d{1,2}/i, label: 'date' },
  { re: /พ\.?\s*ศ\.?\s*\d{4}/, label: 'date' },

  // DOCTOR_NAME
  { re: /(?:แพทย์|นพ\.|พญ\.|ทพ\.|ทพญ\.|Dr\.?)\b/i, label: 'doctor_name' },

  // HOSPITAL_NAME
  { re: /โรงพยาบาล/i, label: 'hospital_name' },
  { re: /(?:คลินิก|สถาน(?:พยาบาล|บริการ))/i, label: 'hospital_name' },

  // PATIENT_NAME — label prefix
  { re: /(?:ชื่อ|ผู้ป่วย|นาย|นาง|นางสาว)\s*(?:[-:]|สกุล)?/i, label: 'patient_name' },
];

// ── Hong Kong (HK) ───────────────────────────────────────────────────────────

const HK_RULES: MarketFieldRule[] = [
  // INSURANCE_ID
  { re: /(?:保單|保險)\s*(?:號碼?|編號)\s*[：:]?\s*[A-Z0-9\-]{3,}/i, label: 'insurance_id' },
  { re: /\b(?:Policy|Claim)\s*(?:No\.?|#)\s*[A-Z0-9\-]{3,}/i, label: 'insurance_id' },

  // AMOUNT — HKD
  { re: /[₫$€£¥]\s*\d[\d,.]*/, label: 'amount' },
  { re: /(?:HK\$|港[幣元])\s*\d[\d,.]*/i, label: 'amount' },
  { re: /\d[\d,.]*\s*(?:港[幣元]|元|HKD)\b/i, label: 'amount' },
  { re: /\d{1,3}(?:[.,]\d{3})+/, label: 'amount' },
  { re: /(?:總[額計]|合計|費用)\s*[：:]?/i, label: 'amount' },

  // DIAGNOSIS
  { re: /(?:診斷|病症)\s*[：:]?/i, label: 'diagnosis' },
  { re: /\b[A-Z]\d{2}(?:\.\d+)?\b/, label: 'diagnosis' },

  // ID_NUMBER — HKID
  { re: /\b[A-Z]{1,2}\d{6}\(?[0-9A]\)?\b/i, label: 'id_number' },
  { re: /(?:身份證|身分證)\s*(?:號碼?)?\s*[：:]?/i, label: 'id_number' },
  { re: /\b\d{9,12}\b/, label: 'id_number' },

  // DATE
  { re: /\b\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}\b/, label: 'date' },
  { re: /\b\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}\b/, label: 'date' },
  { re: /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/, label: 'date' },
  { re: /\d{1,2}\s*月\s*\d{1,2}\s*日/, label: 'date' },

  // DOCTOR_NAME
  { re: /(?:醫生|醫師|Dr\.?)\b/i, label: 'doctor_name' },

  // HOSPITAL_NAME
  { re: /(?:醫院|診所|醫療中心)/i, label: 'hospital_name' },

  // PATIENT_NAME
  { re: /(?:姓名|病人|患者)\s*[：:]?/i, label: 'patient_name' },
];

// ── Indonesia (ID) ───────────────────────────────────────────────────────────

const ID_RULES: MarketFieldRule[] = [
  // INSURANCE_ID — BPJS and private
  { re: /\b(?:BPJS|JKN)\s*[:\-]?\s*\d[\d\s\-]{6,}/i, label: 'insurance_id' },
  { re: /(?:No\.?\s*(?:Polis|Klaim|Peserta))\s*[:\-]?\s*[A-Z0-9\-]{3,}/i, label: 'insurance_id' },

  // AMOUNT — Indonesian Rupiah
  { re: /(?:Rp\.?|IDR)\s*\d[\d,.]*/i, label: 'amount' },
  { re: /\d[\d,.]*\s*(?:rupiah|IDR)\b/i, label: 'amount' },
  { re: /[₫$€£¥]\s*\d[\d,.]*/, label: 'amount' },
  { re: /\d{1,3}(?:[.,]\d{3})+/, label: 'amount' },
  { re: /(?:total|jumlah|biaya)\s*(?:keseluruhan|tagihan)?/i, label: 'amount' },

  // DIAGNOSIS
  { re: /(?:diagnos[aie]|penyakit)/i, label: 'diagnosis' },
  { re: /\b[A-Z]\d{2}(?:\.\d+)?\b/, label: 'diagnosis' },

  // ID_NUMBER — KTP (16 digits) or general
  { re: /\b\d{16}\b/, label: 'id_number' },
  { re: /\b\d{9,13}\b/, label: 'id_number' },
  { re: /(?:No\.?\s*(?:RM|Rekam\s*Medis|KTP|Identitas))\s*[:\-]?/i, label: 'id_number' },

  // DATE — Indonesian month names
  { re: /\b\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}\b/, label: 'date' },
  { re: /\b\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}\b/, label: 'date' },
  { re: /\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4}/i, label: 'date' },
  { re: /(?:tanggal|tgl\.?)\s*[:\-]?\s*\d{1,2}/i, label: 'date' },

  // DOCTOR_NAME
  { re: /\b(?:dr\.?|dokter|Sp\.\s*[A-Z]+)\b/i, label: 'doctor_name' },

  // HOSPITAL_NAME
  { re: /(?:rumah\s*sakit|RS\.?)\b/i, label: 'hospital_name' },
  { re: /(?:klinik|puskesmas)/i, label: 'hospital_name' },

  // PATIENT_NAME
  { re: /(?:nama\s*(?:pasien|lengkap)?)\s*[:\-]?/i, label: 'patient_name' },
];

// ── Name detection regexes ───────────────────────────────────────────────────

// Vietnamese diacritics: À-Ỹ / à-ỹ
const VN_TITLE_CASE = /^(?:[A-ZÀ-Ỹ][a-zà-ỹ]*\s+){1,}[A-ZÀ-Ỹ][a-zà-ỹ]*$/;
const VN_ALL_CAPS   = /^(?:[A-ZÀ-Ỹ]+\s+){1,}[A-ZÀ-Ỹ]+$/;

// Thai names (Thai Unicode block ก-๙ plus Latin)
const TH_TITLE_CASE = /^(?:[A-ZÀ-Ỹก-ฮ][a-zà-ỹะ-์]*\s+){1,}[A-ZÀ-Ỹก-ฮ][a-zà-ỹะ-์]*$/;
const TH_ALL_CAPS   = /^(?:[A-ZÀ-Ỹ]+\s+){1,}[A-ZÀ-Ỹ]+$/;

// Traditional Chinese — names are typically 2–4 characters, no spaces
const HK_TITLE_CASE = /^(?:[A-ZÀ-Ỹ][a-zà-ỹ]*\s+){1,}[A-ZÀ-Ỹ][a-zà-ỹ]*$/;
const HK_ALL_CAPS   = /^(?:[A-ZÀ-Ỹ]+\s+){1,}[A-ZÀ-Ỹ]+$/;

// Indonesian — standard Latin alphabet
const ID_TITLE_CASE = /^(?:[A-Z][a-z]*\s+){1,}[A-Z][a-z]*$/;
const ID_ALL_CAPS   = /^(?:[A-Z]+\s+){1,}[A-Z]+$/;

// ── Market config registry ───────────────────────────────────────────────────

const MARKETS: Record<MarketCode, MarketConfig> = {
  VN: {
    code: 'VN',
    ocrLangs: ['vi', 'en'],
    promptLanguage: 'Vietnamese',
    fieldRules: VN_RULES,
    titleCaseNameRe: VN_TITLE_CASE,
    allCapsNameRe: VN_ALL_CAPS,
  },
  TH: {
    code: 'TH',
    ocrLangs: ['th', 'en'],
    promptLanguage: 'Thai',
    fieldRules: TH_RULES,
    titleCaseNameRe: TH_TITLE_CASE,
    allCapsNameRe: TH_ALL_CAPS,
  },
  HK: {
    code: 'HK',
    ocrLangs: ['ch_tra', 'en'],
    promptLanguage: 'Traditional Chinese',
    fieldRules: HK_RULES,
    titleCaseNameRe: HK_TITLE_CASE,
    allCapsNameRe: HK_ALL_CAPS,
  },
  ID: {
    code: 'ID',
    ocrLangs: ['id', 'en'],
    promptLanguage: 'Indonesian',
    fieldRules: ID_RULES,
    titleCaseNameRe: ID_TITLE_CASE,
    allCapsNameRe: ID_ALL_CAPS,
  },
};

/** Get the full market configuration for a given market code. */
export function getMarketConfig(market: MarketCode): MarketConfig {
  return MARKETS[market];
}
