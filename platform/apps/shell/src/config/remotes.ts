export const remotes = {
  claimsAutomation: {
    name: 'Claims Automation',
    url: import.meta.env.VITE_CLAIMS_REMOTE_URL ?? 'http://localhost:3001',
    path: '/claims',
  },
  fwaDetection: {
    name: 'FWA Detection',
    url: import.meta.env.VITE_FWA_REMOTE_URL ?? 'http://localhost:3002',
    path: '/fwa',
  },
} as const;
