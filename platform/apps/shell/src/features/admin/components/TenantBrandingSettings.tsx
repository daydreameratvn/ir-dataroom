import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Button,
} from '@papaya/shared-ui';
import { useTenant } from '@/providers/TenantProvider';
import TenantBranding from '@/components/TenantBranding';
import { getTenantBranding, updateTenantBranding } from '../branding-api';

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
      {children}
    </label>
  );
}

interface BrandingForm {
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
}

export default function TenantBrandingSettings() {
  const { tenant, setTenant } = useTenant();
  const [form, setForm] = useState<BrandingForm>({
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#ED1B55',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    // Load current branding from API
    getTenantBranding().then((data) => {
      setForm({
        logoUrl: data.logoUrl || '',
        faviconUrl: data.faviconUrl || '',
        primaryColor: data.primaryColor || '#ED1B55',
      });
    });
  }, []);

  const handleChange = (field: keyof BrandingForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveMessage(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      await updateTenantBranding({
        logoUrl: form.logoUrl || undefined,
        faviconUrl: form.faviconUrl || undefined,
        primaryColor: form.primaryColor || undefined,
      });

      // Update tenant context with new branding
      setTenant({
        ...tenant,
        logoUrl: form.logoUrl || undefined,
        faviconUrl: form.faviconUrl || undefined,
        primaryColor: form.primaryColor || undefined,
      });

      setSaveMessage('Branding saved successfully!');
    } catch {
      setSaveMessage('Failed to save branding. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tenant Branding</CardTitle>
          <CardDescription>
            Customize the appearance of Oasis for your organization. Upload your
            logo and choose your brand colors to give users a personalized
            experience.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logo URL */}
          <div className="space-y-2">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input
              id="logoUrl"
              type="url"
              placeholder="https://example.com/logo.png"
              value={form.logoUrl}
              onChange={(e) => handleChange('logoUrl', e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Recommended size: 128x128px. Supported formats: PNG, JPG, SVG.
            </p>
          </div>

          {/* Favicon URL */}
          <div className="space-y-2">
            <Label htmlFor="faviconUrl">Favicon URL</Label>
            <Input
              id="faviconUrl"
              type="url"
              placeholder="https://example.com/favicon.ico"
              value={form.faviconUrl}
              onChange={(e) => handleChange('faviconUrl', e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Recommended size: 32x32px or 64x64px. Supported formats: ICO, PNG.
            </p>
          </div>

          {/* Primary Color */}
          <div className="space-y-2">
            <Label htmlFor="primaryColor">Primary Color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="primaryColor"
                value={form.primaryColor}
                onChange={(e) => handleChange('primaryColor', e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border"
              />
              <Input
                type="text"
                placeholder="#ED1B55"
                value={form.primaryColor}
                onChange={(e) => handleChange('primaryColor', e.target.value)}
                className="w-32"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              This color will be used for accents and interactive elements.
            </p>
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
            {saveMessage && (
              <span
                className={
                  saveMessage.includes('success')
                    ? 'text-sm text-green-600'
                    : 'text-sm text-red-600'
                }
              >
                {saveMessage}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview Card */}
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            See how your branding will appear in the sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
            <TenantBranding
              logoUrl={form.logoUrl || undefined}
              tenantName={tenant.name}
              size="lg"
            />
            <div>
              <p className="font-medium">{tenant.name}</p>
              <p className="text-sm text-muted-foreground">
                {form.logoUrl ? 'Custom logo' : 'Using default initial'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
