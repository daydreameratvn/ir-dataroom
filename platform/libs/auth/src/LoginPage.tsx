import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from '@papaya/i18n';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Separator } from '@papaya/shared-ui';
import { useAuth } from './AuthProvider';
import {
  getSSOUrl,
  requestEmailOtp,
  requestPhoneOtp,
  verifyOtp,
  getPasskeyLoginOptions,
  verifyPasskeyLogin,
} from './auth-client';

type OtpMode = 'email' | 'phone';
type LoginStep = 'choose' | 'otp-input' | 'otp-verify';

interface LocationState {
  from?: { pathname: string };
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  const [step, setStep] = useState<LoginStep>('choose');
  const [otpMode, setOtpMode] = useState<OtpMode>('email');
  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const tenantId = 'papaya-demo'; // TODO: resolve from TenantProvider
  const returnUrl = (location.state as LocationState)?.from?.pathname || '/';

  // Check for error from SSO redirect
  const searchParams = new URLSearchParams(location.search);
  const ssoError = searchParams.get('error');

  async function handleSendOtp() {
    setError(null);
    setIsSubmitting(true);

    try {
      if (otpMode === 'email') {
        await requestEmailOtp(destination, tenantId);
      } else {
        await requestPhoneOtp(destination, tenantId);
      }
      setOtpSent(true);
      setStep('otp-verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await verifyOtp(destination, code, tenantId);
      signIn(result.user, result.accessToken, result.expiresAt);
      navigate(returnUrl, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasskeyLogin() {
    setError(null);
    setIsSubmitting(true);

    try {
      const options = await getPasskeyLoginOptions(tenantId);

      // Use WebAuthn browser API
      const credential = await navigator.credentials.get({
        publicKey: options as unknown as PublicKeyCredentialRequestOptions,
      });

      if (!credential) {
        setError('Passkey authentication cancelled');
        return;
      }

      const result = await verifyPasskeyLogin(
        options.challengeKey,
        credential,
        tenantId,
      );

      signIn(result.user, result.accessToken, result.expiresAt);
      navigate(returnUrl, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6 text-primary"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </div>
          <CardTitle className="text-2xl">{t('auth.signIn')}</CardTitle>
          <p className="text-sm text-muted-foreground">Papaya Insurance Platform</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {(error || ssoError) && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error || ssoError}
            </div>
          )}

          {step === 'choose' && (
            <>
              {/* SSO Buttons */}
              <div className="space-y-2">
                <a href={getSSOUrl('google', tenantId, returnUrl)} className="block">
                  <Button variant="outline" className="w-full justify-start gap-3" type="button">
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    {t('auth.login.continueWithGoogle')}
                  </Button>
                </a>
                <a href={getSSOUrl('microsoft', tenantId, returnUrl)} className="block">
                  <Button variant="outline" className="w-full justify-start gap-3" type="button">
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
                      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
                      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
                    </svg>
                    {t('auth.login.continueWithMicrosoft')}
                  </Button>
                </a>
                <a href={getSSOUrl('apple', tenantId, returnUrl)} className="block">
                  <Button variant="outline" className="w-full justify-start gap-3" type="button">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                    {t('auth.login.continueWithApple')}
                  </Button>
                </a>
              </div>

              <div className="relative">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  {t('auth.login.or')}
                </span>
              </div>

              {/* OTP Input */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    variant={otpMode === 'email' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setOtpMode('email');
                      setDestination('');
                    }}
                    type="button"
                  >
                    {t('auth.login.email')}
                  </Button>
                  <Button
                    variant={otpMode === 'phone' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setOtpMode('phone');
                      setDestination('');
                    }}
                    type="button"
                  >
                    {t('auth.login.phone')}
                  </Button>
                </div>
                <Input
                  type={otpMode === 'email' ? 'email' : 'tel'}
                  placeholder={
                    otpMode === 'email'
                      ? t('auth.login.emailPlaceholder')
                      : t('auth.login.phonePlaceholder')
                  }
                  value={destination}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDestination(e.target.value)}
                />
                <Button
                  className="w-full"
                  onClick={handleSendOtp}
                  disabled={isSubmitting || !destination}
                  type="button"
                >
                  {isSubmitting ? t('common.loading') : t('auth.login.sendCode')}
                </Button>
              </div>

              {/* Passkey */}
              {typeof window !== 'undefined' && window.PublicKeyCredential && (
                <>
                  <div className="relative">
                    <Separator />
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                      {t('auth.login.or')}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handlePasskeyLogin}
                    disabled={isSubmitting}
                    type="button"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                    >
                      <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
                      <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
                    </svg>
                    {t('auth.login.usePasskey')}
                  </Button>
                </>
              )}
            </>
          )}

          {step === 'otp-verify' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('auth.login.codeSentTo', { destination })}
              </p>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-[0.5em]"
                autoFocus
              />
              <Button
                className="w-full"
                onClick={handleVerifyOtp}
                disabled={isSubmitting || code.length !== 6}
                type="button"
              >
                {isSubmitting ? t('common.loading') : t('auth.login.verify')}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep('choose');
                  setCode('');
                  setOtpSent(false);
                  setError(null);
                }}
                type="button"
              >
                {t('common.back')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
