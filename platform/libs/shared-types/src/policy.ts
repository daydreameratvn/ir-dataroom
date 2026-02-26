export type PolicyStatus = 'draft' | 'active' | 'expired' | 'cancelled' | 'suspended' | 'pending_renewal';

export interface Policy {
  id: string;
  policyNumber: string;
  status: PolicyStatus;
  insuredName: string;
  insuredId: string;
  productName: string;
  productCode: string;
  effectiveDate: string;
  expiryDate: string;
  premium: number;
  currency: string;
  sumInsured: number;
  endorsements: number;
  createdAt: string;
  updatedAt: string;
}

export interface Endorsement {
  id: string;
  endorsementNumber: string;
  policyId: string;
  type: 'amendment' | 'cancellation' | 'reinstatement' | 'renewal';
  description: string;
  effectiveDate: string;
  premiumAdjustment: number;
  status: 'draft' | 'pending' | 'approved' | 'applied' | 'rejected';
  createdAt: string;
  updatedAt: string;
}
