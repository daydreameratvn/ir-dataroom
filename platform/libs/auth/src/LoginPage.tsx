import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation, supportedLanguages, languageNames } from '@papaya/i18n';
import type { SupportedLanguage } from '@papaya/i18n';
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

  const tenantId = 'papaya-demo';
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
    <>
      <style>{`
        .oasis-login { display: flex; min-height: 100vh; }
        .oasis-brand { display: none; }
        .oasis-mobile-logo { display: block; margin-bottom: 40px; text-align: center; }
        @media (min-width: 1024px) {
          .oasis-brand { display: flex; }
          .oasis-mobile-logo { display: none; }
        }
        .oasis-sso:hover { border-color: rgba(197,151,91,0.3) !important; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
        .oasis-cta:hover:not(:disabled) { background: #0F4A4F !important; }
        .oasis-passkey:hover { border-color: rgba(197,151,91,0.3) !important; color: #1A1A1A !important; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
      `}</style>

      <div className="oasis-login">
        {/* ── Left: Brand Panel ── */}
        <div
          className="oasis-brand"
          style={{
            position: 'relative',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden',
            padding: 48,
            width: 520,
            minWidth: 520,
            background: 'linear-gradient(135deg, #0D3B3F 0%, #0B2027 50%, #061214 100%)',
            fontFamily: "'DM Serif Display', Georgia, serif",
          }}
        >
          {/* Topographic contour lines */}
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 520 900"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
            style={{ position: 'absolute', inset: 0 }}
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
          <div style={{ position: 'absolute', top: '20%', left: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(197,151,91,0.06)', filter: 'blur(100px)' }} />
          <div style={{ position: 'absolute', bottom: '25%', right: -20, width: 250, height: 250, borderRadius: '50%', background: 'rgba(26,107,99,0.12)', filter: 'blur(80px)' }} />

          {/* Top: Logo */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h1 style={{ fontSize: '3.4rem', lineHeight: 1, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>
              Oasis
            </h1>
            <p style={{ marginTop: 8, fontSize: 12, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 300, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.3)' }}>
              by Papaya
            </p>
          </div>

          {/* Middle: Tagline */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p style={{ fontSize: '1.4rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.55)', fontWeight: 400, margin: 0 }}>
              Where insurance operations
              <br />
              find clarity.
            </p>
            <div style={{ marginTop: 24, height: 1, width: 64, background: 'linear-gradient(90deg, rgba(197,151,91,0.5) 0%, transparent 100%)' }} />
          </div>

          {/* Bottom: Attribution */}
          <p style={{ position: 'relative', zIndex: 1, fontSize: 11, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 300, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.18)', margin: 0 }}>
            &copy; 2026 Papaya Insurance Technology
          </p>
        </div>

        {/* ── Right: Form Panel ── */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '48px 24px', background: '#FAFAF7',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          position: 'relative',
        }}>
          {/* Language switcher — top right */}
          <LoginLanguageSwitcher />

          <div style={{ width: '100%', maxWidth: 380 }}>
            {/* Mobile logo */}
            <div className="oasis-mobile-logo">
              <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '1.8rem', color: '#0D3B3F', margin: 0 }}>
                Oasis
              </h1>
              <p style={{ marginTop: 4, fontSize: 11, fontWeight: 300, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: '#8B8178' }}>
                by Papaya
              </p>
            </div>

            {/* Heading */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '1.65rem', color: '#1A1A1A', margin: 0 }}>
                {t('common.welcome')}
              </h2>
              <p style={{ margin: 0, marginTop: 6, fontSize: 13.5, color: '#8B8178' }}>
                Sign in to your account to continue
              </p>
            </div>

            {/* Error */}
            {(error || ssoError) && (
              <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(220,38,38,0.15)', background: 'rgba(254,242,242,0.5)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p style={{ fontSize: 13, color: 'rgba(185,28,28,0.8)', margin: 0 }}>{error || ssoError}</p>
              </div>
            )}

            {step === 'choose' && (
              <>
                {/* SSO Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <SSOButton href={getSSOUrl('google', tenantId, returnUrl)} icon={<GoogleIcon />} label={t('auth.login.continueWithGoogle')} />
                  <SSOButton href={getSSOUrl('microsoft', tenantId, returnUrl)} icon={<MicrosoftIcon />} label={t('auth.login.continueWithMicrosoft')} />
                  <SSOButton href={getSSOUrl('apple', tenantId, returnUrl)} icon={<AppleIcon />} label={t('auth.login.continueWithApple')} />
                </div>

                {/* Divider */}
                <div style={{ position: 'relative', margin: '28px 0' }}>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '100%', height: 1, background: '#E5DDD3' }} />
                  </div>
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                    <span style={{ background: '#FAFAF7', padding: '0 12px', fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#B5AFA6' }}>
                      {t('auth.login.or')}
                    </span>
                  </div>
                </div>

                {/* OTP Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <input
                    type="text"
                    placeholder={`${t('auth.login.emailPlaceholder')} / ${t('auth.login.phonePlaceholder')}`}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    style={{
                      height: 44, padding: '0 14px', borderRadius: 12,
                      border: '1px solid #E5DDD3', background: '#fff',
                      fontSize: 13.5, color: '#1A1A1A', outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(13,59,63,0.3)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#E5DDD3'; }}
                  />

                  <button
                    type="button"
                    className="oasis-cta"
                    onClick={handleSendOtp}
                    disabled={isSubmitting || !destination}
                    style={{
                      width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: '#0D3B3F', color: '#fff', fontSize: 13.5, fontWeight: 600,
                      opacity: (isSubmitting || !destination) ? 0.4 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    {isSubmitting ? t('common.loading') : t('auth.login.sendCode')}
                  </button>
                </div>

                {/* Passkey */}
                {typeof window !== 'undefined' && window.PublicKeyCredential && (
                  <>
                    <div style={{ position: 'relative', margin: '28px 0' }}>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: '100%', height: 1, background: '#E5DDD3' }} />
                      </div>
                      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                        <span style={{ background: '#FAFAF7', padding: '0 12px', fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#B5AFA6' }}>
                          {t('auth.login.or')}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="oasis-passkey"
                      onClick={handlePasskeyLogin}
                      disabled={isSubmitting}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        padding: '12px 16px', borderRadius: 12,
                        border: '1px solid #E5DDD3', background: '#fff',
                        fontSize: 13.5, fontWeight: 500, color: '#5A5550', cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <KeyIcon />
                      {t('auth.login.usePasskey')}
                    </button>
                  </>
                )}
              </>
            )}

            {/* OTP Verify Step */}
            {step === 'otp-verify' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ padding: 16, borderRadius: 12, border: '1px solid #E5DDD3', background: '#fff' }}>
                  <p style={{ fontSize: 13, color: '#5A5550', margin: 0 }}>
                    {t('auth.login.codeSentTo', { destination })}
                  </p>
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  style={{
                    height: 56, padding: '0 14px', borderRadius: 12,
                    border: '1px solid #E5DDD3', background: '#fff',
                    fontSize: 24, color: '#1A1A1A', textAlign: 'center' as const,
                    letterSpacing: '0.5em', outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(13,59,63,0.3)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E5DDD3'; }}
                />

                <button
                  type="button"
                  className="oasis-cta"
                  onClick={handleVerifyOtp}
                  disabled={isSubmitting || code.length !== 6}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: '#0D3B3F', color: '#fff', fontSize: 13.5, fontWeight: 600,
                    opacity: (isSubmitting || code.length !== 6) ? 0.4 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  {isSubmitting ? t('common.loading') : t('auth.login.verify')}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('choose'); setCode(''); setOtpSent(false); setError(null); }}
                  style={{ width: '100%', padding: '8px 0', fontSize: 13, fontWeight: 500, color: '#8B8178', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  &larr; {t('common.back')}
                </button>
              </div>
            )}

            {/* Footer */}
            <p style={{ marginTop: 40, textAlign: 'center' as const, fontSize: 11, color: '#B5AFA6' }}>
              {t('common.poweredBy')}
            </p>
          </div>
        </div>
      </div>
    </>
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
      className="oasis-sso"
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 16px', borderRadius: 12,
        border: '1px solid #E5DDD3', background: '#fff',
        fontSize: 13.5, fontWeight: 500, color: '#1A1A1A',
        textDecoration: 'none', transition: 'all 0.2s',
      }}
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}

/* ── Language Switcher ── */

function LoginLanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const currentLang = (i18n.language || 'en') as SupportedLanguage;

  return (
    <div style={{ position: 'absolute', top: 20, right: 24 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          border: '1px solid transparent', background: 'transparent',
          fontSize: 13, fontWeight: 500, color: '#8B8178', cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        {languageNames[currentLang]}
      </button>

      {open && (
        <>
          {/* Backdrop to close */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
            minWidth: 140, padding: 4, borderRadius: 10,
            border: '1px solid #E5DDD3', background: '#fff',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          }}>
            {supportedLanguages.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => { i18n.changeLanguage(lang); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', padding: '8px 12px',
                  borderRadius: 6, border: 'none', textAlign: 'left' as const,
                  fontSize: 13, fontWeight: currentLang === lang ? 600 : 400,
                  color: currentLang === lang ? '#0D3B3F' : '#5A5550',
                  background: currentLang === lang ? 'rgba(13,59,63,0.06)' : 'transparent',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (currentLang !== lang) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
                onMouseLeave={(e) => { if (currentLang !== lang) e.currentTarget.style.background = 'transparent'; }}
              >
                {languageNames[lang]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
