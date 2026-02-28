import type { UserType, UserLevel } from './auth';

export interface NavItem {
  id: string;
  labelKey: string;
  icon?: string;
  path?: string;
  children?: NavItem[];
  requiredFeature?: string;
  requiredUserTypes?: UserType[];
  requiredMinLevel?: UserLevel;
}

export interface NavGroup {
  id: string;
  labelKey: string;
  groupIcon?: string;
  items: NavItem[];
}

export type { UserType, UserLevel } from './auth';
