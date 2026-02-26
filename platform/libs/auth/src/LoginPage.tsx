import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation, supportedLanguages, languageNames } from '@papaya/i18n';
import type { SupportedLanguage } from '@papaya/i18n';
import {
  cn,
  Button,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@papaya/shared-ui';
import { useAuth } from './AuthProvider';
import {
  getSSOUrl,
  requestEmailOtp,
  requestPhoneOtp,
  verifyOtp,
  getPasskeyLoginOptions,
  verifyPasskeyLogin,
} from './auth-client';

type LoginStep = 'choose' | 'otp-verify';

interface LocationState {
  from?: { pathname: string };
}

/* ── Brand icon SVGs with explicit dimensions ── */

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
      <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

/* ── Divider with text ── */

function OrDivider({ text }: { text: string }) {
  return (
    <div className="relative my-7">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full h-px bg-papaya-border" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-papaya-surface px-3 text-[11px] font-medium uppercase tracking-widest text-papaya-muted/70">
          {text}
        </span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  const [step, setStep] = useState<LoginStep>('choose');
  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const returnUrl = (location.state as LocationState)?.from?.pathname || '/';

  const searchParams = new URLSearchParams(location.search);
  const ssoError = searchParams.get('error');

  async function handleSendOtp() {
    setError(null);
    setIsSubmitting(true);
    try {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination.trim());
      if (isEmail) {
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
      const credential = await navigator.credentials.get({
        publicKey: options as unknown as PublicKeyCredentialRequestOptions,
      });
      if (!credential) {
        setError('Passkey authentication cancelled');
        return;
      }
      const result = await verifyPasskeyLogin(options.challengeKey, credential, tenantId);
      signIn(result.user, result.accessToken, result.expiresAt);
      navigate(returnUrl, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left: Brand Panel ── */}
      <div className="hidden lg:flex relative flex-col justify-between overflow-hidden p-12 w-[520px] min-w-[520px] bg-gradient-to-br from-papaya-bark via-papaya-earth to-papaya-night font-[DM_Serif_Display,Georgia,serif]">
        {/* Topographic contour lines */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 520 900"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0"
        >
          <g stroke="rgba(255,255,255,0.05)" strokeWidth="0.75" fill="none">
            <circle cx="400" cy="240" r="60" />
            <circle cx="400" cy="240" r="120" />
            <circle cx="400" cy="240" r="190" />
            <circle cx="400" cy="240" r="270" />
            <circle cx="400" cy="240" r="360" />
            <circle cx="90" cy="680" r="50" />
            <circle cx="90" cy="680" r="110" />
            <circle cx="90" cy="680" r="180" />
            <circle cx="90" cy="680" r="260" />
            <circle cx="260" cy="480" r="35" />
            <circle cx="260" cy="480" r="80" />
            <circle cx="260" cy="480" r="135" />
          </g>
        </svg>

        {/* Warm accent orbs */}
        <div className="absolute top-[20%] -left-15 w-[300px] h-[300px] rounded-full bg-papaya-salmon/8 blur-[100px]" />
        <div className="absolute bottom-[25%] -right-5 w-[250px] h-[250px] rounded-full bg-papaya-peach/10 blur-[80px]" />

        {/* Top: Logo */}
        <div className="relative z-10">
          <h1 className="text-[3.4rem] leading-none text-white tracking-tight">
            Oasis
          </h1>
          <p className="mt-2 text-xs font-[Plus_Jakarta_Sans,system-ui,sans-serif] font-light tracking-[0.2em] uppercase text-white/30">
            by Papaya
          </p>
        </div>

        {/* Middle: Tagline */}
        <div className="relative z-10">
          <p className="text-[1.4rem] leading-relaxed text-white/55 font-normal">
            Where insurance operations
            <br />
            find clarity.
          </p>
          <div className="mt-6 h-px w-16 bg-gradient-to-r from-papaya-salmon/50 to-transparent" />
        </div>

        {/* Bottom: Attribution */}
        <p className="relative z-10 text-[11px] font-[Plus_Jakarta_Sans,system-ui,sans-serif] font-light tracking-wide text-white/[0.18]">
          &copy; 2026 Papaya
        </p>
      </div>

      {/* ── Right: Form Panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-papaya-surface font-[Plus_Jakarta_Sans,system-ui,sans-serif] relative">
        {/* Language switcher — top right */}
        <LoginLanguageSwitcher />

        <div className="w-full max-w-[380px]">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10 text-center">
            <h1 className="text-3xl font-[DM_Serif_Display,Georgia,serif] text-papaya-coral">
              Oasis
            </h1>
            <p className="mt-1 text-[11px] font-light tracking-[0.15em] uppercase text-papaya-muted">
              by Papaya
            </p>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-[1.65rem] font-[DM_Serif_Display,Georgia,serif] text-foreground">
              {t('common.welcome')}
            </h2>
            <p className="mt-1.5 text-[13.5px] text-papaya-muted">
              Sign in to your account to continue
            </p>
          </div>

          {/* Error */}
          {(error || ssoError) && (
            <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl border border-destructive/15 bg-destructive/5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(0 84% 60%)" strokeWidth="2" className="shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-[13px] text-destructive/80">{error || ssoError}</p>
            </div>
          )}

          {step === 'choose' && (
            <>
              {/* SSO Buttons */}
              <div className="flex flex-col gap-2.5">
                <SSOButton href={getSSOUrl('google', tenantId, returnUrl)} icon={<GoogleIcon />} label={t('auth.login.continueWithGoogle')} />
                <SSOButton href={getSSOUrl('microsoft', tenantId, returnUrl)} icon={<MicrosoftIcon />} label={t('auth.login.continueWithMicrosoft')} />
                <SSOButton href={getSSOUrl('apple', tenantId, returnUrl)} icon={<AppleIcon />} label={t('auth.login.continueWithApple')} />
              </div>

              <OrDivider text={t('auth.login.or')} />

              {/* OTP Section */}
              <form onSubmit={(e) => { e.preventDefault(); handleSendOtp(); }} className="flex flex-col gap-3.5">
                <Input
                  type="text"
                  placeholder={`${t('auth.login.emailPlaceholder')} / ${t('auth.login.phonePlaceholder')}`}
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="h-11 rounded-xl border-papaya-border bg-white text-[13.5px] text-foreground focus-visible:border-papaya-coral/30 focus-visible:ring-papaya-coral/20"
                />

                <Button
                  type="submit"
                  disabled={isSubmitting || !destination}
                  className="w-full h-11 rounded-xl bg-papaya-coral text-white text-[13.5px] font-semibold hover:bg-papaya-coral/85 disabled:opacity-40"
                >
                  {isSubmitting ? t('common.loading') : t('auth.login.sendCode')}
                </Button>
              </form>

              {/* Passkey */}
              {typeof window !== 'undefined' && window.PublicKeyCredential && (
                <>
                  <OrDivider text={t('auth.login.or')} />

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePasskeyLogin}
                    disabled={isSubmitting}
                    className="w-full h-11 rounded-xl border-papaya-border bg-white text-[13.5px] font-medium text-muted-foreground hover:border-papaya-coral/25 hover:text-foreground"
                  >
                    <KeyIcon />
                    {t('auth.login.usePasskey')}
                  </Button>
                </>
              )}
            </>
          )}

          {/* OTP Verify Step */}
          {step === 'otp-verify' && (
            <form onSubmit={(e) => { e.preventDefault(); handleVerifyOtp(); }} className="flex flex-col gap-5">
              <div className="p-4 rounded-xl border border-papaya-border bg-white">
                <p className="text-[13px] text-muted-foreground">
                  {t('auth.login.codeSentTo', { destination })}
                </p>
              </div>

              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
                className="h-14 rounded-xl border-papaya-border bg-white text-2xl text-center tracking-[0.5em] text-foreground focus-visible:border-papaya-coral/30 focus-visible:ring-papaya-coral/20"
              />

              <Button
                type="submit"
                disabled={isSubmitting || code.length !== 6}
                className="w-full h-11 rounded-xl bg-papaya-coral text-white text-[13.5px] font-semibold hover:bg-papaya-coral/85 disabled:opacity-40"
              >
                {isSubmitting ? t('common.loading') : t('auth.login.verify')}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => { setStep('choose'); setCode(''); setOtpSent(false); setError(null); }}
                className="w-full text-[13px] font-medium text-papaya-muted hover:text-foreground"
              >
                &larr; {t('common.back')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── SSO Button ── */

interface SSOButtonProps {
  href: string;
  icon: React.ReactNode;
  label: string;
}

function SSOButton({ href, icon, label }: SSOButtonProps) {
  return (
    <Button variant="outline" asChild className="h-auto justify-start gap-3.5 rounded-xl border-papaya-border bg-white px-4 py-3 text-[13.5px] font-medium text-foreground hover:border-papaya-coral/25 hover:bg-white">
      <a href={href}>
        {icon}
        <span>{label}</span>
      </a>
    </Button>
  );
}

/* ── Language Switcher ── */

function LoginLanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en') as SupportedLanguage;

  return (
    <div className="absolute top-5 right-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-papaya-muted hover:text-foreground hover:bg-accent transition-colors outline-none">
            <GlobeIcon />
            {languageNames[currentLang]}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          {supportedLanguages.map((lang) => (
            <DropdownMenuItem
              key={lang}
              onClick={() => i18n.changeLanguage(lang)}
              className={cn(
                'text-[13px] cursor-pointer',
                currentLang === lang && 'font-semibold text-papaya-coral'
              )}
            >
              {languageNames[lang]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
