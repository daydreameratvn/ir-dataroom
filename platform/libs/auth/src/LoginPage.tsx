import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from '@papaya/i18n';
import { Input } from '@papaya/shared-ui';
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
    <div className="flex min-h-screen" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* ── Left: Brand Panel ── */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-[480px] xl:w-[560px]">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0D3B3F] via-[#0B2027] to-[#061214]" />

        {/* Topographic contour lines */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 560 900"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          <g stroke="rgba(255,255,255,0.04)" strokeWidth="0.75">
            <circle cx="420" cy="260" r="60" />
            <circle cx="420" cy="260" r="110" />
            <circle cx="420" cy="260" r="170" />
            <circle cx="420" cy="260" r="240" />
            <circle cx="420" cy="260" r="320" />
            <circle cx="420" cy="260" r="410" />
            <circle cx="100" cy="700" r="50" />
            <circle cx="100" cy="700" r="100" />
            <circle cx="100" cy="700" r="160" />
            <circle cx="100" cy="700" r="230" />
            <circle cx="100" cy="700" r="310" />
            <circle cx="280" cy="500" r="30" />
            <circle cx="280" cy="500" r="70" />
            <circle cx="280" cy="500" r="120" />
          </g>
        </svg>

        {/* Warm accent orbs */}
        <div className="absolute -left-20 top-1/4 h-80 w-80 rounded-full bg-[#C5975B]/8 blur-[120px]" />
        <div className="absolute bottom-1/3 right-0 h-64 w-64 rounded-full bg-[#1A6B63]/15 blur-[100px]" />
        <div className="absolute -bottom-10 left-1/3 h-48 w-48 rounded-full bg-[#C5975B]/5 blur-[80px]" />

        {/* Noise texture overlay */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.4]" xmlns="http://www.w3.org/2000/svg">
          <filter id="login-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#login-noise)" opacity="0.04" />
        </svg>

        {/* Content */}
        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          {/* Top: Logo */}
          <div
            className="animate-[fadeSlideIn_0.8s_ease_both]"
          >
            <h1
              className="text-[3.2rem] leading-none tracking-tight text-white xl:text-[3.8rem]"
              style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
            >
              Oasis
            </h1>
            <p className="mt-2 text-[13px] font-light tracking-[0.2em] uppercase text-white/30">
              by Papaya
            </p>
          </div>

          {/* Middle: Tagline */}
          <div
            className="animate-[fadeSlideIn_0.8s_ease_0.2s_both]"
          >
            <p
              className="text-[1.35rem] font-light leading-relaxed text-white/60 xl:text-[1.5rem]"
              style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
            >
              Where insurance operations
              <br />
              find clarity.
            </p>
            <div className="mt-6 h-px w-16 bg-gradient-to-r from-[#C5975B]/60 to-transparent" />
          </div>

          {/* Bottom: Attribution */}
          <p
            className="text-[11px] font-light tracking-wider text-white/20 animate-[fadeSlideIn_0.8s_ease_0.4s_both]"
          >
            &copy; 2026 Papaya Insurance Technology
          </p>
        </div>
      </div>

      {/* ── Right: Form Panel ── */}
      <div className="flex flex-1 items-center justify-center bg-[#FAFAF7] px-6 py-12">
        <div className="w-full max-w-[380px]">
          {/* Mobile logo */}
          <div
            className="mb-10 text-center lg:hidden animate-[fadeSlideIn_0.6s_ease_both]"
          >
            <h1
              className="text-3xl text-[#0D3B3F]"
              style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
            >
              Oasis
            </h1>
            <p className="mt-1 text-xs font-light tracking-[0.15em] uppercase text-[#8B8178]">
              by Papaya
            </p>
          </div>

          {/* Heading */}
          <div className="mb-8 animate-[fadeSlideIn_0.6s_ease_0.1s_both]">
            <h2
              className="text-[1.65rem] text-[#1A1A1A]"
              style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
            >
              {t('common.welcome')}
            </h2>
            <p className="mt-1.5 text-[13.5px] text-[#8B8178]">
              Sign in to your account to continue
            </p>
          </div>

          {/* Error */}
          {(error || ssoError) && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200/60 bg-red-50/50 px-4 py-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-[13px] text-red-600/80">{error || ssoError}</p>
            </div>
          )}

          {step === 'choose' && (
            <div className="animate-[fadeSlideIn_0.6s_ease_0.2s_both]">
              {/* SSO Buttons */}
              <div className="space-y-2.5">
                <a href={getSSOUrl('google', tenantId, returnUrl)} className="block">
                  <button
                    className="group flex w-full items-center gap-3.5 rounded-xl border border-[#E5DDD3] bg-white px-4 py-3 text-[13.5px] font-medium text-[#1A1A1A] transition-all duration-200 hover:border-[#C5975B]/30 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
                    type="button"
                  >
                    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    <span>{t('auth.login.continueWithGoogle')}</span>
                    <svg className="ml-auto h-4 w-4 -translate-x-1 text-[#8B8178] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </a>

                <a href={getSSOUrl('microsoft', tenantId, returnUrl)} className="block">
                  <button
                    className="group flex w-full items-center gap-3.5 rounded-xl border border-[#E5DDD3] bg-white px-4 py-3 text-[13.5px] font-medium text-[#1A1A1A] transition-all duration-200 hover:border-[#C5975B]/30 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
                    type="button"
                  >
                    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24">
                      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
                      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
                      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
                    </svg>
                    <span>{t('auth.login.continueWithMicrosoft')}</span>
                    <svg className="ml-auto h-4 w-4 -translate-x-1 text-[#8B8178] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </a>

                <a href={getSSOUrl('apple', tenantId, returnUrl)} className="block">
                  <button
                    className="group flex w-full items-center gap-3.5 rounded-xl border border-[#E5DDD3] bg-white px-4 py-3 text-[13.5px] font-medium text-[#1A1A1A] transition-all duration-200 hover:border-[#C5975B]/30 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
                    type="button"
                  >
                    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                    <span>{t('auth.login.continueWithApple')}</span>
                    <svg className="ml-auto h-4 w-4 -translate-x-1 text-[#8B8178] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </a>
              </div>

              {/* Divider */}
              <div className="relative my-7">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#E5DDD3]" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[#FAFAF7] px-3 text-[12px] font-medium tracking-wider uppercase text-[#B5AFA6]">
                    {t('auth.login.or')}
                  </span>
                </div>
              </div>

              {/* OTP Section */}
              <div className="space-y-4">
                {/* Email / Phone Toggle */}
                <div className="flex rounded-lg bg-[#EDEBE6] p-0.5">
                  <button
                    className={`flex-1 rounded-md px-4 py-2 text-[13px] font-medium transition-all duration-200 ${
                      otpMode === 'email'
                        ? 'bg-white text-[#1A1A1A] shadow-sm'
                        : 'text-[#8B8178] hover:text-[#5A5550]'
                    }`}
                    onClick={() => { setOtpMode('email'); setDestination(''); }}
                    type="button"
                  >
                    {t('auth.login.email')}
                  </button>
                  <button
                    className={`flex-1 rounded-md px-4 py-2 text-[13px] font-medium transition-all duration-200 ${
                      otpMode === 'phone'
                        ? 'bg-white text-[#1A1A1A] shadow-sm'
                        : 'text-[#8B8178] hover:text-[#5A5550]'
                    }`}
                    onClick={() => { setOtpMode('phone'); setDestination(''); }}
                    type="button"
                  >
                    {t('auth.login.phone')}
                  </button>
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
                  className="h-11 rounded-xl border-[#E5DDD3] bg-white text-[13.5px] placeholder:text-[#B5AFA6] focus-visible:border-[#0D3B3F]/30 focus-visible:ring-[#0D3B3F]/10"
                />

                <button
                  className="w-full rounded-xl bg-[#0D3B3F] py-3 text-[13.5px] font-semibold text-white transition-all duration-200 hover:bg-[#0F4A4F] active:scale-[0.99] disabled:opacity-40 disabled:active:scale-100"
                  onClick={handleSendOtp}
                  disabled={isSubmitting || !destination}
                  type="button"
                >
                  {isSubmitting ? t('common.loading') : t('auth.login.sendCode')}
                </button>
              </div>

              {/* Passkey */}
              {typeof window !== 'undefined' && window.PublicKeyCredential && (
                <>
                  <div className="relative my-7">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-[#E5DDD3]" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-[#FAFAF7] px-3 text-[12px] font-medium tracking-wider uppercase text-[#B5AFA6]">
                        {t('auth.login.or')}
                      </span>
                    </div>
                  </div>

                  <button
                    className="group flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#E5DDD3] bg-white px-4 py-3 text-[13.5px] font-medium text-[#5A5550] transition-all duration-200 hover:border-[#C5975B]/30 hover:text-[#1A1A1A] hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
                    onClick={handlePasskeyLogin}
                    disabled={isSubmitting}
                    type="button"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
                      <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
                    </svg>
                    {t('auth.login.usePasskey')}
                  </button>
                </>
              )}
            </div>
          )}

          {/* OTP Verify Step */}
          {step === 'otp-verify' && (
            <div className="space-y-5 animate-[fadeSlideIn_0.4s_ease_both]">
              <div className="rounded-xl border border-[#E5DDD3] bg-white p-4">
                <p className="text-[13px] text-[#5A5550]">
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value.replace(/\D/g, ''))}
                className="h-14 rounded-xl border-[#E5DDD3] bg-white text-center text-2xl tracking-[0.5em] placeholder:text-[#D5D0C8] focus-visible:border-[#0D3B3F]/30 focus-visible:ring-[#0D3B3F]/10"
                autoFocus
              />

              <button
                className="w-full rounded-xl bg-[#0D3B3F] py-3 text-[13.5px] font-semibold text-white transition-all duration-200 hover:bg-[#0F4A4F] active:scale-[0.99] disabled:opacity-40 disabled:active:scale-100"
                onClick={handleVerifyOtp}
                disabled={isSubmitting || code.length !== 6}
                type="button"
              >
                {isSubmitting ? t('common.loading') : t('auth.login.verify')}
              </button>

              <button
                className="w-full py-2 text-[13px] font-medium text-[#8B8178] transition-colors hover:text-[#1A1A1A]"
                onClick={() => {
                  setStep('choose');
                  setCode('');
                  setOtpSent(false);
                  setError(null);
                }}
                type="button"
              >
                &larr; {t('common.back')}
              </button>
            </div>
          )}

          {/* Footer */}
          <p className="mt-10 text-center text-[11px] text-[#B5AFA6] animate-[fadeSlideIn_0.6s_ease_0.4s_both]">
            {t('common.poweredBy')}
          </p>
        </div>
      </div>

      {/* Custom keyframes */}
      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
