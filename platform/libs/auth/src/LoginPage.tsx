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
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuth } from './AuthProvider';
import {
  getSSOUrl,
  requestEmailOtp,
  requestPhoneOtp,
  verifyOtp,
  getPasskeyLoginOptions,
  verifyPasskeyLogin,
  AuthError,
} from './auth-client';

type LoginStep = 'choose' | 'otp-verify';

interface LocationState {
  from?: { pathname: string };
}

/* ── Brand icon SVGs ── */

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  const ssoErrorCode = searchParams.get('error');
  const ssoError = ssoErrorCode
    ? t(`auth.login.errors.${ssoErrorCode}`, { defaultValue: t('auth.login.errors.unknown') })
    : null;

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
      setError(err instanceof Error ? err.message : t('auth.login.failedToSendCode'));
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
      if (err instanceof AuthError && err.status >= 500) {
        setError(err.message);
      } else {
        setError(t('auth.login.invalidCode'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasskeyLogin() {
    setError(null);
    setIsSubmitting(true);
    try {
      const options = await getPasskeyLoginOptions(tenantId);
      const credential = await startAuthentication({ optionsJSON: options });
      const result = await verifyPasskeyLogin(options.challengeKey, credential, tenantId);
      signIn(result.user, result.accessToken, result.expiresAt);
      navigate(returnUrl, { replace: true });
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError(t('auth.login.passkeyCancelled'));
      } else if (err instanceof AuthError && err.status >= 500) {
        setError(err.message);
      } else {
        setError(t('auth.login.passkeyFailed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white overflow-hidden">
      {/* ── Left: Brand Panel (desktop) ── */}
      <div className="hidden lg:flex relative flex-col justify-between w-[45%] max-w-[640px] bg-papaya-darkest p-16">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-papaya-darkest">
          {/* Main gradient wash */}
          <div className="absolute inset-0 bg-gradient-to-br from-papaya-darker via-papaya-darkest to-black" />
          
          {/* Colorful accent orbs */}
          <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-papaya/10 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-900/20 blur-[100px]" />
          
          {/* Subtle noise texture overlay */}
          <div className="absolute inset-0 opacity-[0.03] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIi8+CjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz4KPC9zdmc+')] [mask-image:linear-gradient(to_bottom,transparent,black)]" />
        </div>

        {/* Contour lines (decorative) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
          <svg className="absolute w-full h-full text-papaya" viewBox="0 0 100 100" preserveAspectRatio="none">
             <path d="M0 100 C 20 0 50 0 100 100 Z" fill="none" stroke="currentColor" strokeWidth="0.5" className="opacity-10 translate-y-10" />
             <path d="M0 100 C 30 20 70 20 100 100 Z" fill="none" stroke="currentColor" strokeWidth="0.5" className="opacity-20 translate-y-5" />
             <path d="M0 100 C 40 40 60 40 100 100 Z" fill="none" stroke="currentColor" strokeWidth="0.5" className="opacity-30" />
          </svg>
        </div>

        {/* Content Layer */}
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div>
            <h1 className="text-5xl font-bold text-white tracking-tighter mb-2">
              Oasis
            </h1>
            <div className="flex items-center gap-3">
              <div className="h-px w-8 bg-papaya"></div>
              <p className="text-xs font-medium tracking-[0.3em] uppercase text-white/60">
                by Papaya
              </p>
            </div>
          </div>

          <div className="space-y-8">
            <blockquote className="text-2xl font-light leading-relaxed text-white/90">
              "Insurance infrastructure for the <span className="text-papaya font-normal">modern world</span>. Designed for clarity, built for scale."
            </blockquote>
          </div>

          <div className="flex items-center justify-between text-xs text-white/30 font-medium tracking-wide uppercase">
            <p>© 2026 Papaya</p>
            <p>v3.0.0</p>
          </div>
        </div>
      </div>

      {/* ── Right: Form Panel ── */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-12 relative bg-white">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.4]" />
        
        {/* Language switcher */}
        <LoginLanguageSwitcher />

        <div className="relative w-full max-w-[420px] bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-[0_0_0_1px_rgba(0,0,0,0.03),0_2px_8px_rgba(0,0,0,0.04),0_12px_24px_rgba(0,0,0,0.04)]">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10 text-center">
            <h1 className="text-3xl font-bold text-papaya tracking-tight">Oasis</h1>
            <p className="mt-1 text-[10px] font-medium tracking-[0.2em] uppercase text-papaya-muted/70">by Papaya</p>
          </div>

          {/* Heading */}
          <div className="mb-8 text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight text-[#111316]">
              {t('common.welcome')}
            </h2>
            <p className="mt-2 text-[15px] text-papaya-muted">
              {t('auth.login.subtitle')}
            </p>
          </div>

          {/* Error */}
          {(error || ssoError) && (
            <div className="mb-6 flex items-start gap-3 p-4 rounded-xl border border-destructive/20 bg-destructive/5 animate-in fade-in slide-in-from-top-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-destructive shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm font-medium text-destructive">{error || ssoError}</p>
            </div>
          )}

          {step === 'choose' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* SSO Buttons */}
              <div className="flex flex-col gap-3">
                <SSOButton href={getSSOUrl('google', tenantId, returnUrl)} icon={<GoogleIcon />} label={t('auth.login.continueWithGoogle')} />
                <SSOButton href={getSSOUrl('microsoft', tenantId, returnUrl)} icon={<MicrosoftIcon />} label={t('auth.login.continueWithMicrosoft')} />
                <SSOButton href={getSSOUrl('apple', tenantId, returnUrl)} icon={<AppleIcon />} label={t('auth.login.continueWithApple')} />
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-papaya-border/60" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-3 text-[10px] font-medium uppercase tracking-widest text-papaya-muted/50">
                    {t('auth.login.or')}
                  </span>
                </div>
              </div>

              {/* OTP Section */}
              <form onSubmit={(e) => { e.preventDefault(); handleSendOtp(); }} className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <Input
                    type="text"
                    placeholder={`${t('auth.login.emailPlaceholder')} / ${t('auth.login.phonePlaceholder')}`}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="h-12 rounded-xl border-papaya-border bg-white px-4 text-[15px] text-[#111316] placeholder:text-papaya-muted/50 focus-visible:border-papaya focus-visible:ring-4 focus-visible:ring-papaya/10 transition-all shadow-sm"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting || !destination}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-papaya to-[#D9184E] text-white text-[15px] font-semibold shadow-lg shadow-papaya/25 hover:shadow-xl hover:shadow-papaya/30 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:shadow-none disabled:scale-100"
                >
                  {isSubmitting ? t('common.loading') : t('auth.login.sendCode')}
                </Button>
              </form>

              {/* Passkey */}
              {typeof window !== 'undefined' && window.PublicKeyCredential && (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-dashed border-papaya-border" />
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePasskeyLogin}
                    disabled={isSubmitting}
                    className="w-full h-12 rounded-xl border-papaya-border bg-white text-sm font-medium text-papaya-muted hover:border-papaya/40 hover:text-[#111316] hover:bg-papaya-lightest/30 transition-all"
                  >
                    <KeyIcon />
                    <span className="ml-2">{t('auth.login.usePasskey')}</span>
                  </Button>
                </>
              )}
            </div>
          )}

          {/* OTP Verify Step */}
          {step === 'otp-verify' && (
            <form onSubmit={(e) => { e.preventDefault(); handleVerifyOtp(); }} className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="p-4 rounded-xl border border-papaya/10 bg-papaya-lightest/50">
                <p className="text-sm text-papaya-muted text-center">
                  {t('auth.login.codeSentTo', { destination })}
                </p>
              </div>

              <div className="flex justify-center">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  className="w-full h-16 rounded-xl border-papaya-border bg-white text-3xl font-mono text-center tracking-[0.5em] text-[#111316] placeholder:text-papaya-border focus-visible:border-papaya focus-visible:ring-4 focus-visible:ring-papaya/10 transition-all shadow-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || code.length !== 6}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-papaya to-[#D9184E] text-white text-[15px] font-semibold shadow-lg shadow-papaya/25 hover:shadow-xl hover:shadow-papaya/30 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:shadow-none disabled:scale-100"
              >
                {isSubmitting ? t('common.loading') : t('auth.login.verify')}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => { setStep('choose'); setCode(''); setOtpSent(false); setError(null); }}
                className="w-full text-sm font-medium text-papaya-muted hover:text-[#111316] hover:bg-transparent"
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
    <a
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-papaya-border/80 bg-white px-4 py-3 text-[14px] font-medium text-[#111316] shadow-sm hover:border-papaya/40 hover:shadow-md hover:bg-papaya-lightest/10 active:scale-[0.99] transition-all"
    >
      <span className="flex items-center justify-center w-5 h-5 shrink-0 transition-transform group-hover:scale-110">{icon}</span>
      <span>{label}</span>
    </a>
  );
}

/* ── Language Switcher ── */

function LoginLanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en') as SupportedLanguage;

  return (
    <div className="absolute top-6 right-6 z-20">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-papaya-muted bg-white/50 hover:bg-white hover:text-[#111316] hover:shadow-md transition-all outline-none border border-transparent hover:border-papaya-border/50">
            <GlobeIcon />
            {languageNames[currentLang]}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px] p-1 rounded-xl shadow-xl border-papaya-border/50 bg-white/95 backdrop-blur-sm">
          {supportedLanguages.map((lang) => (
            <DropdownMenuItem
              key={lang}
              onClick={() => i18n.changeLanguage(lang)}
              className={cn(
                'text-[13px] cursor-pointer rounded-lg px-3 py-2 my-0.5',
                currentLang === lang ? 'bg-papaya-lightest text-papaya font-medium' : 'text-papaya-muted hover:text-[#111316] hover:bg-gray-50'
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
