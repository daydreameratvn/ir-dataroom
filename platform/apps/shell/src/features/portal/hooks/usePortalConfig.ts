import { create } from 'zustand';
import type { PortalTenantConfig, PortalModuleId } from '../types';

interface PortalConfigState {
  config: PortalTenantConfig | null;
  setConfig: (config: PortalTenantConfig) => void;
  isModuleEnabled: (moduleId: PortalModuleId) => boolean;
}

export const usePortalConfig = create<PortalConfigState>((set, get) => ({
  config: {
    tenantId: '',
    tenantName: '',
    market: '',
    modules: {
      extraction: true,
      assessment: true,
      medical_necessity: true,
      pre_existing: true,
      image_forensics: false,
      fwa: true,
    },
  } as PortalTenantConfig,
  setConfig: (config) => set({ config }),
  isModuleEnabled: (moduleId) => {
    const { config } = get();
    if (!config) return true;
    return config.modules[moduleId] !== false;
  },
}));
