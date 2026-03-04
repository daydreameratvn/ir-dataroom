/**
 * Investor portal base URL.
 *
 * - Dev: falls back to portless `investors.oasis.localhost:1355`
 * - Prod: set VITE_INVESTOR_PORTAL_URL=https://investors.papaya.asia at build time
 */
export const INVESTOR_PORTAL_URL =
  import.meta.env.VITE_INVESTOR_PORTAL_URL ?? 'http://investors.oasis.localhost:1355';
