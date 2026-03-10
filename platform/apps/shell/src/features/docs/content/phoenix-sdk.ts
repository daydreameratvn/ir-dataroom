export const meta = {
  slug: 'phoenix-sdk',
  title: 'Phoenix Claims SDK',
  description: 'Complete insurance claims portal — claim submission, document upload, claim tracking, and OTP verification.',
  version: '0.0.1',
  icon: 'Flame',
  packages: ['@papaya/phoenix', '@papaya/phoenix-react'],
  tags: ['sdk', 'react', 'claims', 'portal'],
} as const;

// Content loaded at build time via Vite's ?raw import
import content from './phoenix-sdk.md?raw';
export { content };
