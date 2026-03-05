import type { NavGroup } from '@papaya/shared-types';

export const navigationGroups: NavGroup[] = [
  {
    id: 'main',
    labelKey: 'nav.main',
    groupIcon: 'LayoutDashboard',
    items: [
      {
        id: 'dashboard',
        labelKey: 'nav.dashboard',
        icon: 'LayoutDashboard',
        path: '/',
      },
    ],
  },
  {
    id: 'operations',
    labelKey: 'nav.operations',
    groupIcon: 'FileText',
    items: [
      {
        id: 'claims',
        labelKey: 'nav.claims',
        icon: 'FileText',
        requiredFeature: 'claims',
        children: [
          { id: 'claims-intake', labelKey: 'nav.claimsIntake', path: '/claims/intake' },
          { id: 'claims-review', labelKey: 'nav.claimsReview', path: '/claims/review' },
          { id: 'claims-adjudication', labelKey: 'nav.claimsAdjudication', path: '/claims/adjudication' },
          { id: 'claims-history', labelKey: 'nav.claimsHistory', path: '/claims/history' },
        ],
      },
      {
        id: 'policies',
        labelKey: 'nav.policies',
        icon: 'Shield',
        requiredFeature: 'policies',
        children: [
          { id: 'policies-browse', labelKey: 'nav.policiesBrowse', path: '/policies/browse' },
          { id: 'policies-endorsements', labelKey: 'nav.policiesEndorsements', path: '/policies/endorsements' },
          { id: 'policies-renewals', labelKey: 'nav.policiesRenewals', path: '/policies/renewals' },
          { id: 'policies-servicing', labelKey: 'nav.policiesServicing', path: '/policies/servicing' },
        ],
      },
      {
        id: 'underwriting',
        labelKey: 'nav.underwriting',
        icon: 'ClipboardCheck',
        requiredFeature: 'underwriting',
        children: [
          { id: 'uw-applications', labelKey: 'nav.underwritingApplications', path: '/underwriting/applications' },
          { id: 'uw-risk', labelKey: 'nav.underwritingRisk', path: '/underwriting/risk' },
          { id: 'uw-pricing', labelKey: 'nav.underwritingPricing', path: '/underwriting/pricing' },
        ],
      },
    ],
  },
  {
    id: 'intelligence',
    labelKey: 'nav.intelligence',
    groupIcon: 'Brain',
    items: [
      {
        id: 'fwa',
        labelKey: 'nav.fwa',
        icon: 'ShieldAlert',
        path: '/fwa',
      },
      {
        id: 'drone',
        labelKey: 'nav.drone',
        icon: 'Bot',
        path: '/drone',
      },
      {
        id: 'reporting',
        labelKey: 'nav.reporting',
        icon: 'BarChart3',
        requiredFeature: 'reporting',
        children: [
          { id: 'reporting-dashboards', labelKey: 'nav.reportingDashboards', path: '/reporting/dashboards' },
          { id: 'reporting-reports', labelKey: 'nav.reportingReports', path: '/reporting/reports' },
          { id: 'reporting-analytics', labelKey: 'nav.reportingAnalytics', path: '/reporting/analytics' },
          { id: 'reporting-loss', labelKey: 'nav.reportingLoss', path: '/reporting/loss' },
        ],
      },
    ],
  },
  {
    id: 'management',
    labelKey: 'nav.management',
    groupIcon: 'Settings',
    items: [
      {
        id: 'providers',
        labelKey: 'nav.providers',
        icon: 'Building2',
        requiredFeature: 'providers',
        children: [
          { id: 'providers-directory', labelKey: 'nav.providersDirectory', path: '/providers/directory' },
          { id: 'providers-contracts', labelKey: 'nav.providersContracts', path: '/providers/contracts' },
          { id: 'providers-performance', labelKey: 'nav.providersPerformance', path: '/providers/performance' },
        ],
      },
      {
        id: 'ir',
        labelKey: 'nav.ir',
        icon: 'Briefcase',
        requiredFeature: 'ir',
        path: '/ir',
        children: [],
      },
      {
        id: 'admin',
        labelKey: 'nav.admin',
        icon: 'Settings',
        requiredUserTypes: ['insurer', 'papaya'],
        requiredMinLevel: 'manager',
        children: [
          { id: 'admin-users', labelKey: 'nav.adminUsers', path: '/admin/users' },
          { id: 'admin-settings', labelKey: 'nav.adminSettings', path: '/admin/settings' },
          { id: 'admin-audit', labelKey: 'nav.adminAudit', path: '/admin/audit' },
          { id: 'admin-status', labelKey: 'nav.systemStatus', path: '/system-status' },
          { id: 'admin-design-system', labelKey: 'nav.designSystem', path: '/design-system' },
        ],
      },
    ],
  },
];
