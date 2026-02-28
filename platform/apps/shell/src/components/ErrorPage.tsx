import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Home, RotateCcw } from 'lucide-react';
import { cn, Button } from '@papaya/shared-ui';

export interface ErrorPageProps {
  /** 'not-found' for 404, 'crash' for error boundary */
  variant: 'not-found' | 'crash';
  error?: Error | null;
  onRetry?: () => void;
}

/* ── Floating fragment data ── */
const fragments = [
  { size: 120, x: '12%', y: '18%', rotate: 15, delay: 0, duration: 18, opacity: 0.07 },
  { size: 80, x: '72%', y: '12%', rotate: -25, delay: 0.5, duration: 22, opacity: 0.05 },
  { size: 200, x: '80%', y: '55%', rotate: 40, delay: 1, duration: 25, opacity: 0.04 },
  { size: 60, x: '20%', y: '70%', rotate: -10, delay: 0.3, duration: 20, opacity: 0.06 },
  { size: 140, x: '55%', y: '75%', rotate: 55, delay: 0.8, duration: 23, opacity: 0.05 },
  { size: 40, x: '88%', y: '30%', rotate: -40, delay: 0.2, duration: 16, opacity: 0.08 },
  { size: 90, x: '35%', y: '15%', rotate: 70, delay: 0.6, duration: 19, opacity: 0.04 },
];

export default function ErrorPage({ variant, error, onRetry }: ErrorPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Stagger the reveal
    const raf = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const isNotFound = variant === 'not-found';
  const code = isNotFound ? '404' : '500';
  const title = isNotFound
    ? t('error.notFoundTitle', 'Page not found')
    : t('error.crashTitle', 'Something went wrong');
  const subtitle = isNotFound
    ? t('error.notFoundSubtitle', 'The page you\u2019re looking for doesn\u2019t exist or has been moved.')
    : t('error.crashSubtitle', 'An unexpected error occurred. Our team has been notified.');

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* ── Grain overlay ── */}
      <div
        className="pointer-events-none absolute inset-0 z-10 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
        }}
      />

      {/* ── Subtle radial glow ── */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: isNotFound
            ? 'radial-gradient(ellipse 60% 50% at 50% 45%, var(--color-papaya-lightest) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 60% 50% at 50% 45%, hsl(0 60% 97%) 0%, transparent 70%)',
        }}
      />

      {/* ── Floating geometric fragments ── */}
      {fragments.map((f, i) => (
        <div
          key={i}
          className="pointer-events-none absolute z-0 rounded-sm border border-papaya/10"
          style={{
            width: f.size,
            height: f.size,
            left: f.x,
            top: f.y,
            opacity: revealed ? f.opacity : 0,
            transform: revealed
              ? `rotate(${f.rotate}deg) translateY(0px)`
              : `rotate(${f.rotate + 10}deg) translateY(20px)`,
            transition: `all 1.2s cubic-bezier(0.23, 1, 0.32, 1) ${f.delay + 0.3}s`,
            animation: revealed ? `error-float ${f.duration}s ease-in-out infinite` : 'none',
            animationDelay: `${f.delay}s`,
            background: isNotFound
              ? `linear-gradient(${135 + f.rotate}deg, var(--color-papaya) 0%, transparent 60%)`
              : `linear-gradient(${135 + f.rotate}deg, hsl(0 70% 60%) 0%, transparent 60%)`,
          }}
        />
      ))}

      {/* ── Content ── */}
      <div className="relative z-20 flex flex-col items-center px-6 text-center">
        {/* Error code — massive typography */}
        <div
          className={cn(
            'select-none transition-all duration-1000 ease-out',
            revealed
              ? 'translate-y-0 opacity-100'
              : 'translate-y-8 opacity-0'
          )}
        >
          <span
            className="block text-[clamp(8rem,20vw,14rem)] font-extrabold leading-none tracking-tighter"
            style={{
              background: isNotFound
                ? 'linear-gradient(160deg, var(--color-papaya) 20%, var(--color-papaya-light) 80%)'
                : 'linear-gradient(160deg, hsl(0 70% 55%) 20%, hsl(0 50% 75%) 80%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {code}
          </span>
        </div>

        {/* Title */}
        <h1
          className={cn(
            '-mt-2 text-2xl font-bold tracking-tight text-foreground transition-all duration-700 ease-out md:text-3xl',
            revealed
              ? 'translate-y-0 opacity-100 delay-200'
              : 'translate-y-6 opacity-0'
          )}
          style={{ transitionDelay: revealed ? '200ms' : '0ms' }}
        >
          {title}
        </h1>

        {/* Subtitle */}
        <p
          className={cn(
            'mt-3 max-w-md text-base text-muted-foreground transition-all duration-700 ease-out',
            revealed
              ? 'translate-y-0 opacity-100'
              : 'translate-y-6 opacity-0'
          )}
          style={{ transitionDelay: revealed ? '350ms' : '0ms' }}
        >
          {subtitle}
        </p>

        {/* Error detail (crash only) */}
        {!isNotFound && error?.message && (
          <div
            className={cn(
              'mt-4 max-w-lg rounded-lg border bg-muted/50 px-4 py-3 text-left transition-all duration-700 ease-out',
              revealed
                ? 'translate-y-0 opacity-100'
                : 'translate-y-6 opacity-0'
            )}
            style={{ transitionDelay: revealed ? '450ms' : '0ms' }}
          >
            <p className="font-mono text-xs text-muted-foreground break-all">{error.message}</p>
          </div>
        )}

        {/* Actions */}
        <div
          className={cn(
            'mt-8 flex items-center gap-3 transition-all duration-700 ease-out',
            revealed
              ? 'translate-y-0 opacity-100'
              : 'translate-y-6 opacity-0'
          )}
          style={{ transitionDelay: revealed ? '500ms' : '0ms' }}
        >
          {isNotFound ? (
            <>
              <Button variant="outline" size="default" onClick={() => navigate(-1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('error.goBack', 'Go back')}
              </Button>
              <Button asChild>
                <Link to="/">
                  <Home className="mr-2 h-4 w-4" />
                  {t('error.backHome', 'Back to Oasis')}
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="default"
                onClick={onRetry}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('error.tryAgain', 'Try again')}
              </Button>
              <Button asChild>
                <Link to="/">
                  <Home className="mr-2 h-4 w-4" />
                  {t('error.backHome', 'Back to Oasis')}
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Footer brand mark */}
        <div
          className={cn(
            'mt-16 flex items-center gap-2 transition-all duration-700 ease-out',
            revealed
              ? 'translate-y-0 opacity-100'
              : 'translate-y-4 opacity-0'
          )}
          style={{ transitionDelay: revealed ? '700ms' : '0ms' }}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded bg-papaya text-white text-[9px] font-bold">
            O
          </div>
          <span className="text-xs text-muted-foreground/50 tracking-wide uppercase">Oasis</span>
        </div>
      </div>

      {/* ── Keyframe styles ── */}
      <style>{`
        @keyframes error-float {
          0%, 100% { transform: translateY(0px) rotate(var(--tw-rotate, 0deg)); }
          50% { transform: translateY(-12px) rotate(var(--tw-rotate, 0deg)); }
        }
      `}</style>
    </div>
  );
}
