/**
 * Investor portal base URL.
 *
 * Runtime forcing layer: if the browser is on a production domain (papaya.asia),
 * always use the production investor portal URL regardless of build-time env vars.
 * This prevents localhost links from ever appearing on production.
 *
 * - Production: https://investors.papaya.asia (forced at runtime)
 * - Dev: falls back to portless investors.oasis.localhost:1355
 */
function getInvestorPortalUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('papaya.asia')) {
    return 'https://investors.papaya.asia';
  }
  return import.meta.env.VITE_INVESTOR_PORTAL_URL ?? 'http://investors.oasis.localhost:1355';
}

export const INVESTOR_PORTAL_URL = getInvestorPortalUrl();
