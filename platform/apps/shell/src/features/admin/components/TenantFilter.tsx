import { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import type { Tenant } from '@papaya/shared-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@papaya/shared-ui';
import { listTenants } from '../api';

interface TenantFilterProps {
  value: string | undefined;
  onChange: (tenantId: string | undefined) => void;
}

export default function TenantFilter({ value, onChange }: TenantFilterProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchTenants() {
      try {
        const result = await listTenants();
        if (!cancelled) {
          setTenants(result);
        }
      } catch {
        // Silently fail — filter just won't have options
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchTenants();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select
        value={value ?? '__all__'}
        onValueChange={(val) => onChange(val === '__all__' ? undefined : val)}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Select tenant" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All tenants</SelectItem>
          {tenants.map((tenant) => (
            <SelectItem key={tenant.id} value={tenant.id}>
              {tenant.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
