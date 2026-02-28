import { useState, useEffect, useCallback } from 'react';
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
  Input,
} from '@papaya/shared-ui';
import {
  Mail,
  Building2,
  ShieldCheck,
  LogOut,
  KeyRound,
  Check,
  Trash2,
  Pencil,
  Loader2,
  Smartphone,
} from 'lucide-react';
import {
  useAuth,
  getAccessToken,
  getPasskeyRegisterOptions,
  verifyPasskeyRegister,
  listPasskeys,
  deletePasskey as deletePasskeyApi,
  renamePasskey as renamePasskeyApi,
  AuthError,
} from '@papaya/auth';
import type { PasskeyInfo } from '@papaya/auth';
import { startRegistration } from '@simplewebauthn/browser';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPasskeys = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const { passkeys: list } = await listPasskeys(token);
      setPasskeys(list);
    } catch {
      // ignore
    } finally {
      setLoadingPasskeys(false);
    }
  }, []);

  useEffect(() => {
    fetchPasskeys();
  }, [fetchPasskeys]);

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
      const deviceName = detectDeviceName();
      await verifyPasskeyRegister(credential, token, deviceName);
      setMessage({ type: 'success', text: t('auth.passkey.success') });
      await fetchPasskeys();
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setMessage({ type: 'error', text: t('auth.passkey.cancelled') });
      } else if (err instanceof AuthError && err.status === 409) {
        setMessage({ type: 'error', text: t('auth.passkey.alreadyRegistered') });
      } else {
        setMessage({ type: 'error', text: t('auth.passkey.failed') });
      }
    } finally {
      setRegistering(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const token = getAccessToken();
      if (!token) return;
      await deletePasskeyApi(id, token);
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
      setMessage({ type: 'success', text: t('auth.passkey.deleted') });
    } catch {
      setMessage({ type: 'error', text: t('auth.passkey.deleteFailed') });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    try {
      const token = getAccessToken();
      if (!token) return;
      await renamePasskeyApi(id, editName.trim(), token);
      setPasskeys((prev) =>
        prev.map((p) => (p.id === id ? { ...p, deviceName: editName.trim() } : p)),
      );
      setEditingId(null);
      setEditName('');
    } catch {
      setMessage({ type: 'error', text: t('auth.passkey.renameFailed') });
    }
  }

  function startEdit(pk: PasskeyInfo) {
    setEditingId(pk.id);
    setEditName(pk.deviceName || '');
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

            {/* Passkey list */}
            {loadingPasskeys ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('common.loading')}
              </div>
            ) : passkeys.length > 0 ? (
              <div className="space-y-2">
                {passkeys.map((pk) => (
                  <div
                    key={pk.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Smartphone className="size-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        {editingId === pk.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRename(pk.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="h-7 text-sm"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRename(pk.id)}
                            >
                              <Check className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm font-medium truncate">
                            {pk.deviceName || t('auth.passkey.unnamed')}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t('auth.passkey.registered')}: {formatDate(pk.createdAt)}
                          {pk.lastUsedAt && (
                            <> · {t('auth.passkey.lastUsed')}: {formatDate(pk.lastUsedAt)}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEdit(pk)}
                        disabled={editingId === pk.id}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(pk.id)}
                        disabled={deletingId === pk.id}
                      >
                        {deletingId === pk.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                {t('auth.passkey.noPasskeys')}
              </p>
            )}

            <Button
              variant="outline"
              onClick={handleRegisterPasskey}
              disabled={registering}
            >
              {registering ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
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

function detectDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown device';
}
