const translations = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    submit: 'Submit',
    delete: 'Delete',
    edit: 'Edit',
    view: 'View',
    search: 'Search',
    filter: 'Filter',
    export: 'Export',
    import: 'Import',
    loading: 'Loading...',
    noData: 'No data available',
    confirm: 'Confirm',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    close: 'Close',
    refresh: 'Refresh',
    actions: 'Actions',
    status: 'Status',
    date: 'Date',
    amount: 'Amount',
    total: 'Total',
    all: 'All',
    active: 'Active',
    inactive: 'Inactive',
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    poweredBy: 'Powered by Papaya AI',
    comingSoon: 'Coming Soon',
    comingSoonDesc:
      'This feature is being built by our AI engineering team and will be available soon.',
    welcome: 'Welcome back',
    selectModule: 'Select a module from the sidebar to get started',
    getStarted: 'Get Started',
    viewAll: 'View all',
    noResults: 'No results found.',
    newConversation: 'New conversation',
    stop: 'Stop',
    collapse: 'Collapse',
    expand: 'Expand',
    somethingWentWrong: 'Something went wrong',
    tryAgain: 'Try again',
    retry: 'Retry',
  },

  app: {
    name: 'Oasis',
  },

  nav: {
    // Section labels
    main: 'Main',
    operations: 'Operations',
    intelligence: 'Intelligence',
    management: 'Management',
    // Dashboard
    dashboard: 'Dashboard',
    // Claims
    claims: 'Claims',
    claimsIntake: 'Claims Intake',
    claimsReview: 'Review Queue',
    claimsAdjudication: 'Adjudication',
    claimsHistory: 'History',
    // Policies
    policies: 'Policies',
    policiesBrowse: 'Browse Policies',
    policiesEndorsements: 'Endorsements',
    policiesRenewals: 'Renewals',
    policiesServicing: 'Servicing',
    // Underwriting
    underwriting: 'Underwriting',
    underwritingApplications: 'Applications',
    underwritingRisk: 'Risk Assessment',
    underwritingPricing: 'Pricing',
    // FWA
    fwa: 'FWA Detection',
    fwaAlerts: 'Alerts',
    fwaInvestigations: 'Investigations',
    fwaRules: 'Rules Engine',
    // Reporting
    reporting: 'Reporting',
    reportingDashboards: 'Dashboards',
    reportingReports: 'Reports',
    reportingAnalytics: 'Analytics',
    reportingLoss: 'Loss Management',
    // Providers
    providers: 'Providers',
    providersDirectory: 'Directory',
    providersContracts: 'Contracts',
    providersPerformance: 'Performance',
    // Administration
    admin: 'Administration',
    adminUsers: 'Users & Roles',
    adminSettings: 'Settings',
    adminAudit: 'Audit Log',
    // System
    systemStatus: 'System Status',
    designSystem: 'Design System',
    // AI
    aiAgents: 'AI Agents',
  },

  dashboard: {
    title: 'Dashboard',
    subtitle: 'Overview of your insurance operations',
    totalClaims: 'Total Claims',
    pendingReview: 'Pending Review',
    activePolicies: 'Active Policies',
    fwaAlerts: 'FWA Alerts',
    aiProcessed: 'AI Processed Today',
    lossRatio: 'Loss Ratio',
    recentActivity: 'Recent Activity',
    quickActions: 'Quick Actions',
    newClaim: 'New Claim',
    newPolicy: 'New Policy',
    runAnalysis: 'Run Analysis',
    claimsTrend: 'Claims Trend',
    topProviders: 'Top Providers',
    vsLastMonth: 'vs last month',
    vsLastWeek: 'vs last week',
    growth: 'growth',
    accuracy: 'accuracy',
    activity: {
      aiAdjudicated: 'AI adjudicated',
      alertFlagged: 'Alert flagged',
      submitted: 'Submitted',
      renewed: 'Renewed',
      documentsAnalyzed: 'Documents analyzed',
    },
  },

  claims: {
    title: 'Claims Management',
    subtitle: 'Process, review, and manage insurance claims',
    newClaim: 'New Claim',
    claimId: 'Claim ID',
    claimant: 'Claimant',
    provider: 'Provider',
    status: 'Status',
    amount: 'Amount',
    submittedDate: 'Submitted Date',
    statuses: {
      submitted: 'Submitted',
      underReview: 'Under Review',
      aiProcessing: 'AI Processing',
      adjudicated: 'Adjudicated',
      approved: 'Approved',
      denied: 'Denied',
      appealed: 'Appealed',
    },
    intakeTitle: 'Claims Intake',
    intakeDesc:
      'AI-powered claims processing. Submit, review, and adjudicate claims with intelligent automation.',
    reviewTitle: 'Review Queue',
    reviewDesc:
      'Claims pending manual review. AI has flagged these for human attention.',
    adjudicationTitle: 'Adjudication',
    adjudicationDesc:
      'Final adjudication decisions on reviewed claims. Approve, deny, or request additional information.',
    historyTitle: 'Claims History',
    historyDesc:
      'Browse all processed claims with full audit trail and decision history.',
  },

  policies: {
    title: 'Policy Management',
    subtitle: 'Manage policies, endorsements, and renewals',
    newPolicy: 'New Policy',
    policyNumber: 'Policy Number',
    insured: 'Insured',
    product: 'Product',
    effectiveDate: 'Effective Date',
    expiryDate: 'Expiry Date',
    premium: 'Premium',
    statuses: {
      active: 'Active',
      expired: 'Expired',
      cancelled: 'Cancelled',
      pending: 'Pending',
    },
    browseTitle: 'Policy Browser',
    browseDesc:
      'Manage insurance policies, endorsements, and renewals across your portfolio.',
    endorsementsTitle: 'Endorsements',
    endorsementsDesc:
      'Process policy endorsements, amendments, and mid-term adjustments.',
    renewalsTitle: 'Renewals',
    renewalsDesc:
      'Track upcoming policy renewals and manage the renewal workflow.',
    servicingTitle: 'Policy Servicing',
    servicingDesc:
      'Handle policy servicing requests, cancellations, and customer inquiries.',
  },

  underwriting: {
    title: 'Underwriting',
    subtitle: 'Assess risk, price policies, and manage applications',
    newApplication: 'New Application',
    applicant: 'Applicant',
    riskScore: 'Risk Score',
    recommendedPremium: 'Recommended Premium',
    statuses: {
      pending: 'Pending',
      approved: 'Approved',
      declined: 'Declined',
      referToUnderwriter: 'Refer to Underwriter',
      moreInfoRequired: 'More Info Required',
    },
    applicationsTitle: 'Applications',
    applicationsDesc:
      'AI-assisted risk assessment and pricing for new insurance applications.',
    riskTitle: 'Risk Assessment',
    riskDesc:
      'AI-driven risk scoring and analysis for individual applications and portfolios.',
    pricingTitle: 'Pricing',
    pricingDesc:
      'Dynamic pricing models and premium calculations based on risk profiles.',
  },

  fwa: {
    title: 'FWA Detection',
    subtitle: 'Fraud, Waste, and Abuse detection powered by AI',
    alertCount: 'Alert Count',
    severity: {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    },
    investigate: 'Investigate',
    resolve: 'Resolve',
    falsePositive: 'False Positive',
    alertsTitle: 'FWA Alerts',
    alertsDesc:
      'Real-time fraud, waste, and abuse detection powered by Papaya AI agents.',
    investigationsTitle: 'Investigations',
    investigationsDesc:
      'Track and manage ongoing fraud investigations with full case management.',
    rulesTitle: 'Rules Engine',
    rulesDesc:
      'Configure and manage fraud detection rules, thresholds, and scoring models.',
  },

  providers: {
    title: 'Provider Management',
    subtitle: 'Manage medical provider network and contracts',
    providerName: 'Provider Name',
    specialty: 'Specialty',
    contractStatus: 'Contract Status',
    networkStatus: 'Network Status',
    addProvider: 'Add Provider',
    directoryTitle: 'Provider Directory',
    directoryDesc:
      'Manage your medical provider network, contracts, and performance metrics.',
    contractsTitle: 'Contracts',
    contractsDesc:
      'View and manage provider contracts, fee schedules, and agreements.',
    performanceTitle: 'Performance',
    performanceDesc:
      'Track provider performance metrics, quality scores, and compliance ratings.',
  },

  reporting: {
    title: 'Reporting & Analytics',
    subtitle: 'Insights, dashboards, and loss management',
    generateReport: 'Generate Report',
    scheduledReports: 'Scheduled Reports',
    lossRatio: 'Loss Ratio',
    claimsRatio: 'Claims Ratio',
    exportData: 'Export Data',
    dashboardsTitle: 'Dashboards',
    dashboardsDesc:
      'Comprehensive insurance analytics, reporting, and loss management insights.',
    reportsTitle: 'Reports',
    reportsDesc:
      'Generate and schedule regulatory, financial, and operational reports.',
    analyticsTitle: 'Analytics',
    analyticsDesc:
      'Deep-dive analytics with custom queries, visualizations, and data exploration.',
    lossTitle: 'Loss Management',
    lossDesc:
      'Track loss ratios, reserve adequacy, and claims development triangles.',
  },

  admin: {
    title: 'Administration',
    subtitle: 'Manage users, roles, tenants, and system settings',
    users: 'Users',
    roles: 'Roles',
    tenants: 'Tenants',
    systemSettings: 'System Settings',
    auditLog: 'Audit Log',
    aiAgentConfig: 'AI Agent Configuration',
    addUser: 'Add User',
    inviteUser: 'Invite User',
    editUser: 'Edit User',
    createUser: 'Create User',
    table: {
      name: 'Name',
      type: 'Type',
      level: 'Level',
      department: 'Department',
      lastLogin: 'Last Login',
      openMenu: 'Open menu',
      edit: 'Edit',
      delete: 'Delete',
    },
    searchPlaceholder: 'Search by name or email...',
    filters: {
      allTypes: 'All types',
      allLevels: 'All levels',
    },
    userTypes: {
      insurer: 'Insurer',
      broker: 'Broker',
      provider: 'Provider',
      papaya: 'Papaya',
    },
    userLevels: {
      admin: 'Admin',
      executive: 'Executive',
      manager: 'Manager',
      staff: 'Staff',
      viewer: 'Viewer',
    },
    lastLogin: {
      never: 'Never',
      justNow: 'Just now',
      minutesAgo: '{{count}}m ago',
      hoursAgo: '{{count}}h ago',
      daysAgo: '{{count}}d ago',
    },
    emptyState: {
      noUsersFound: 'No users found',
      adjustFilters: 'Try adjusting your search or filters.',
      addFirstUser: 'Get started by adding your first user.',
    },
    pagination: {
      showing: 'Showing {{start}}-{{end}} of {{total}} users',
      pageOf: 'Page {{page}} of {{totalPages}}',
    },
    deleteDialog: {
      title: 'Delete User',
      description: 'Are you sure you want to delete {{name}}? This action cannot be undone.',
      deleting: 'Deleting...',
    },
    form: {
      name: 'Name',
      namePlaceholder: 'John Doe',
      email: 'Email',
      emailPlaceholder: 'john@example.com',
      phone: 'Phone',
      phonePlaceholder: '+66 812 345 678',
      type: 'Type',
      level: 'Level',
      jobTitle: 'Title',
      titlePlaceholder: 'VP of Claims',
      department: 'Department',
      departmentPlaceholder: 'Operations',
      tenant: 'Tenant',
      selectTenant: 'Select a tenant',
      allTenants: 'All tenants',
    },
    dialog: {
      editDescription: 'Update the user details below.',
      createDescription: 'Fill in the details to create a new user.',
      saving: 'Saving...',
      creating: 'Creating...',
      saveChanges: 'Save Changes',
      createUser: 'Create User',
    },
    validation: {
      nameRequired: 'Name is required',
      emailRequired: 'Email is required',
      invalidEmail: 'Invalid email address',
      tenantRequired: 'Tenant is required',
    },
    usersTitle: 'Users & Roles',
    usersDesc:
      'Manage users, roles, system settings, and review audit trails.',
    settingsTitle: 'Settings',
    settingsDesc:
      'Configure system-wide settings, integrations, and tenant preferences.',
    auditTitle: 'Audit Log',
    auditDesc:
      'Review all system activity, user actions, and configuration changes.',
  },

  auth: {
    signIn: 'Sign In',
    signOut: 'Sign Out',
    profile: 'Profile',
    settings: 'Settings',
    role: 'Role',
    switchOrganization: 'Switch Organization',
    login: {
      continueWithGoogle: 'Continue with Google',
      continueWithMicrosoft: 'Continue with Microsoft',
      continueWithApple: 'Continue with Apple',
      or: 'or',
      email: 'Email',
      phone: 'Phone',
      emailPlaceholder: 'you@company.com',
      phonePlaceholder: '+66 8X XXX XXXX',
      sendCode: 'Send verification code',
      codeSentTo: 'We sent a 6-digit code to {{destination}}',
      verify: 'Verify',
      usePasskey: 'Sign in with passkey',
      subtitle: 'Sign in to your account to continue',
      failedToSendCode: 'Failed to send code',
      invalidCode: 'Invalid code',
      passkeyCancelled: 'Passkey authentication cancelled',
      passkeyFailed: 'Passkey authentication failed',
    },
  },

  tenant: {
    switchTenant: 'Switch Tenant',
    currentTenant: 'Current Tenant',
  },

  language: {
    en: 'English',
    th: 'ไทย',
    zh: '中文',
    vi: 'Tiếng Việt',
    switchLanguage: 'Language',
  },

  aiAgents: {
    title: 'AI Agents',
    subtitle: 'Papaya AI agents powering your insurance operations',
    agents: {
      claimAssessor: 'Claim Assessor',
      fraudDetector: 'Fraud Detector',
      underwritingAssistant: 'Underwriting Assistant',
      documentAnalyzer: 'Document Analyzer',
      complianceChecker: 'Compliance Checker',
      lossPredictor: 'Loss Predictor',
    },
    statuses: {
      online: 'Online',
      offline: 'Offline',
      processing: 'Processing',
      idle: 'Idle',
    },
    configure: 'Configure',
    viewLogs: 'View Logs',
  },

  fatima: {
    name: 'Fatima',
    subtitle: 'Wise woman of the desert',
    pageSubtitle: 'Your AI insurance operations assistant',
    thinking: 'Thinking...',
    placeholder: 'Ask Fatima anything...',
    pagePlaceholder:
      'Ask Fatima anything about your insurance operations...',
    disclaimer:
      'Fatima can make mistakes. Verify important information.',
    tryAsking: 'Try asking',
    askFatima: 'Ask Fatima',
    openFatima: 'Open Fatima',
    openInFatima: 'Open in Fatima',
    askWithQuery: 'Ask Fatima: \u201c{{query}}\u201d',
    welcome: `Hello! I'm **Fatima** — the wise woman of the desert. Like the wind that knows every grain of sand in the Sahara, I know every claim, every policy, every pattern hidden in your data.

I can help you with:

- **Claims** — Look up status, find claims by patient or provider, explain adjudication decisions
- **Policies** — Search policies, check coverage details, review endorsements
- **Underwriting** — Assess risk scores, check application status
- **FWA** — Review fraud alerts, investigate suspicious patterns
- **Providers** — Find providers, check contract status
- **Analytics** — Loss ratios, claims trends, KPI summaries

What would you like to know?`,
    offlineFallback:
      "I'm having trouble connecting right now. Please make sure the service is running. I'll be ready once the connection is restored.",
    suggestions: {
      recentClaims: 'Show recent claims',
      fraudAlerts: 'Any fraud alerts?',
      capabilities: 'What can you do?',
      lossRatio: 'Loss ratio this month',
      fraudAlertsToday: 'Any fraud alerts today?',
      whatIsLossRatio: 'What is our loss ratio?',
      findPolicy: 'Find policy for Siam Group',
      underwriting: 'Help me with underwriting',
    },
  },

  theme: {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    switchTheme: 'Theme',
    customize: 'Customize',
    customizeDesc: 'Pick a color theme, adjust radius, and choose your preferred mode.',
    color: 'Color',
    radius: 'Radius',
    mode: 'Mode',
    reset: 'Reset to defaults',
    colors: {
      papaya: 'Papaya',
      blue: 'Blue',
      green: 'Green',
      orange: 'Orange',
      violet: 'Violet',
      rose: 'Rose',
      zinc: 'Zinc',
    },
  },

  commandPalette: {
    title: 'Oasis Command Palette',
    placeholder: 'Type a command or ask Fatima...',
    aiAssistant: 'AI Assistant',
    quickActions: 'Quick Actions',
    goTo: 'Go to',
    openHint: 'to open',
    typeToAsk: 'type anything to ask Fatima',
    escToGoBack: 'to go back',
  },
  status: {
    title: 'System Status',
    subtitle: 'Real-time health and uptime for all Oasis services',
    services: 'Services',
    servicesUptime: '90-day uptime history',
    recentIncidents: 'Recent Incidents',
    last7Days: 'Last 7 days',
    overallUptime: 'Overall uptime',
    activeIncidents: 'Active incidents',
    footer: 'Updated every 60 seconds',
    daysAgo: '{{count}}d ago',
    ninetyDaysAgo: '90 days ago',
    today: 'Today',
    resolved: 'Resolved {{time}}',
    statusLabels: {
      operational: 'Operational',
      degraded: 'Degraded',
      outage: 'Major Outage',
      maintenance: 'Maintenance',
    },
    severityLabels: {
      minor: 'Minor',
      major: 'Major',
      critical: 'Critical',
    },
    overall: {
      operational: 'All Systems Operational',
      operationalDesc: 'All services are running normally.',
      degraded: 'Partial System Degradation',
      degradedDesc: 'Some services are experiencing issues.',
      outage: 'Major System Outage',
      outageDesc: 'Critical services are currently unavailable.',
      maintenance: 'Scheduled Maintenance',
      maintenanceDesc: 'Some services are undergoing maintenance.',
    },
  },
} as const;

export default translations;
