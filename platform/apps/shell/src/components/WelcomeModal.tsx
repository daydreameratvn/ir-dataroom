import { useState, useEffect, useMemo } from 'react';
import { Sparkles, ArrowRight, Shield, FileText, Brain, ChartBar } from 'lucide-react';
import { cn, Button } from '@papaya/shared-ui';
import { useTenant } from '@/providers/TenantProvider';
import TenantBranding from './TenantBranding';

export interface WelcomeModalProps {
  open: boolean;
  onComplete: () => void;
}

const features = [
  {
    icon: FileText,
    title: 'Claims Processing',
    description: 'AI-powered claims intake, review, and adjudication',
  },
  {
    icon: Shield,
    title: 'Policy Management',
    description: 'Complete lifecycle from underwriting to servicing',
  },
  {
    icon: Brain,
    title: 'Fraud Detection',
    description: 'Real-time fraud, waste, and abuse detection',
  },
  {
    icon: ChartBar,
    title: 'Analytics',
    description: 'Deep insights into loss ratios and trends',
  },
];

export default function WelcomeModal({ open, onComplete }: WelcomeModalProps) {
  const { tenant } = useTenant();
  const [step, setStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Reset step when modal opens
  useEffect(() => {
    if (open) {
      setStep(0);
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 500);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Pre-compute random star positions so they don't shift on re-render
  const starPositions = useMemo(
    () =>
      Array.from({ length: 50 }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        animationDelay: `${Math.random() * 2}s`,
        animationDuration: `${2 + Math.random() * 3}s`,
      })),
    [],
  );

  if (!open) return null;

  const handleContinue = () => {
    if (step < 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to Oasis" className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
        {/* Subtle animated stars/dots effect */}
        <div className="absolute inset-0 opacity-30">
          {starPositions.map((pos, i) => (
            <div
              key={i}
              className="absolute h-1 w-1 rounded-full bg-white animate-pulse"
              style={pos}
            />
          ))}
        </div>

        {/* Gradient orbs */}
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-papaya/20 blur-3xl animate-pulse" />
        <div className="absolute -right-40 -bottom-40 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Content */}
      <div
        className={cn(
          'relative z-10 w-full max-w-2xl px-6',
          'transform transition-all duration-500',
          isAnimating ? 'scale-95 opacity-0' : 'scale-100 opacity-100',
        )}
      >
        {step === 0 && (
          <div className="text-center">
            {/* Tenant Logo */}
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <TenantBranding size="lg" className="h-20 w-20 text-2xl" />
                <div className="absolute -inset-2 rounded-full bg-papaya/20 blur-xl animate-pulse" />
              </div>
            </div>

            {/* Welcome Text */}
            <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">
              Welcome to <span className="text-papaya">Oasis</span>
            </h1>
            <p className="mb-2 text-xl text-zinc-300">
              {tenant.name}
            </p>

            {/* Fatima Introduction */}
            <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-zinc-700 bg-zinc-800/50 p-6 backdrop-blur">
              <div className="mb-4 flex items-center justify-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-white">Fatima</h3>
                  <p className="text-sm text-zinc-400">The wise woman of the desert</p>
                </div>
              </div>

              <p className="text-zinc-300 leading-relaxed">
                &ldquo;Greetings, traveler. I am <span className="text-violet-400 font-medium">Fatima</span>,
                the caretaker of this Oasis. Like the wind that knows every grain of sand in the Sahara,
                I know every claim, every policy, every pattern hidden in your data.&rdquo;
              </p>

              <p className="mt-4 text-zinc-400 text-sm">
                Let me be your guide through this journey. I&apos;m here to help you navigate
                claims, detect fraud, and uncover insights in your insurance operations.
              </p>
            </div>

            {/* CTA Button */}
            <Button
              onClick={handleContinue}
              size="lg"
              className="mt-8 bg-papaya hover:bg-papaya/90 text-white px-8"
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="text-center">
            <h2 className="mb-2 text-3xl font-bold text-white">
              Your Insurance Command Center
            </h2>
            <p className="mb-8 text-zinc-400">
              Everything you need to manage insurance operations at scale
            </p>

            {/* Features Grid */}
            <div className="grid grid-cols-2 gap-4">
              {features.map((feature, i) => (
                <div
                  key={feature.title}
                  className={cn(
                    'rounded-xl border border-zinc-700 bg-zinc-800/50 p-5 text-left backdrop-blur',
                    'transform transition-all duration-300',
                  )}
                  style={{ transitionDelay: `${i * 100}ms` }}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-papaya/10">
                    <feature.icon className="h-5 w-5 text-papaya" />
                  </div>
                  <h3 className="mb-1 font-semibold text-white">{feature.title}</h3>
                  <p className="text-sm text-zinc-400">{feature.description}</p>
                </div>
              ))}
            </div>

            {/* Fatima hint */}
            <div className="mx-auto mt-8 flex max-w-md items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/30 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <p className="text-sm text-zinc-400">
                <span className="text-violet-400">Tip:</span> Press{' '}
                <kbd className="mx-1 rounded border border-zinc-600 bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
                  ⌘J
                </kbd>{' '}
                anytime to ask me anything about your data
              </p>
            </div>

            {/* CTA Button */}
            <Button
              onClick={handleContinue}
              size="lg"
              className="mt-8 bg-papaya hover:bg-papaya/90 text-white px-8"
            >
              Enter Oasis
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step indicators */}
        <div className="mt-8 flex justify-center gap-2">
          {[0, 1].map((s) => (
            <div
              key={s}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                s === step ? 'w-6 bg-papaya' : 'w-1.5 bg-zinc-600',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
