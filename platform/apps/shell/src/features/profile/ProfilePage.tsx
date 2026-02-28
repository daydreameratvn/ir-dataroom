import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
} from '@papaya/shared-ui';
import { Mail, Building2, ShieldCheck, LogOut, KeyRound, Check } from 'lucide-react';
import { useAuth, getAccessToken, getPasskeyRegisterOptions, verifyPasskeyRegister } from '@papaya/auth';
import { startRegistration } from '@simplewebauthn/browser';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  async function handleRegisterPasskey() {
    setRegistering(true);
    setMessage(null);
    try {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const optionsJSON = await getPasskeyRegisterOptions(token);
      const credential = await startRegistration({ optionsJSON });
      await verifyPasskeyRegister(credential, token);
      setMessage({ type: 'success', text: t('auth.passkey.success') });
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setMessage({ type: 'error', text: t('auth.passkey.cancelled') });
      } else {
        setMessage({ type: 'error', text: t('auth.passkey.failed') });
      }
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('auth.profile')} />

      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user.avatarUrl} alt={user.name} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <CardTitle className="text-xl">{user.name}</CardTitle>
                {user.title && (
                  <p className="text-sm text-muted-foreground">{user.title}</p>
                )}
                <div className="flex gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {user.userLevel}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {user.userType}
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="size-4 text-muted-foreground" />
              <span>{user.email}</span>
            </div>
            {user.department && (
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="size-4 text-muted-foreground" />
                <span>{user.department}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <ShieldCheck className="size-4 text-muted-foreground" />
              <span className="capitalize">{user.userLevel} access</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" />
              {t('auth.security')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <KeyRound className="size-4" />
                {t('auth.passkey.title')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('auth.passkey.description')}
              </p>
            </div>

            {message && (
              <div
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                    : 'bg-destructive/10 text-destructive'
                }`}
              >
                {message.type === 'success' && <Check className="size-4" />}
                {message.text}
              </div>
            )}

            <Button
              variant="outline"
              onClick={handleRegisterPasskey}
              disabled={registering}
            >
              <KeyRound className="size-4" />
              {registering ? t('auth.passkey.registering') : t('auth.passkey.register')}
            </Button>
          </CardContent>
        </Card>

        <Button variant="outline" className="w-full" onClick={signOut}>
          <LogOut className="size-4" />
          {t('auth.signOut')}
        </Button>
      </div>
    </div>
  );
}
