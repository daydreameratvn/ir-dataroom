import type { ReactNode } from 'react';

export type ServiceStatus = 'operational' | 'degraded' | 'outage' | 'maintenance';

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
  message?: string;
}

export interface StatusIncident {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  affectedServices: string[];
  startedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
}

export interface IncidentUpdate {
  id: string;
  incidentId: string;
  status: string;
  message: string;
  createdAt: string;
  createdBy: string | null;
}

export interface StatusIncidentWithUpdates extends StatusIncident {
  updates: IncidentUpdate[];
}

export interface DailyServiceStatus {
  name: string;
  status: string;
}

export interface DailyStatus {
  date: string;
  services: DailyServiceStatus[];
}

export interface ServiceOverride {
  id: string;
  serviceName: string;
  status: string;
  reason: string | null;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface StatusResponse {
  services: ServiceHealth[];
  incidents: StatusIncident[];
  uptimeHistory: DailyStatus[];
  overrides: ServiceOverride[];
  checkedAt: string;
}

export interface Service extends ServiceHealth {
  description: string;
  icon: ReactNode;
  dailyStatus: ServiceStatus[];
  uptime: number;
}
