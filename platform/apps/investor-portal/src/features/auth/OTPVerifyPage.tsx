import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@papaya/shared-ui';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { verifyOtp, requestOtp } from '@/lib/api';
import { useInvestorAuth } from '@/providers/InvestorAuthProvider';

const CODE_LENGTH = 6;

export default function OTPVerifyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const { login } = useInvestorAuth();

  const [digits, setDigits] = useState<string[]>(Array.from({ length: CODE_LENGTH }, () => ''));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) {
      navigate('/login', { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleChange(index: number, value: string) {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError(null);

    // Auto-advance
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (pasted.length > 0) {
      const next = Array.from({ length: CODE_LENGTH }, (_, i) => pasted[i] ?? '');
      setDigits(next);
      const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1);
      inputRefs.current[focusIndex]?.focus();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const code = digits.join('');
    if (code.length !== CODE_LENGTH) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await verifyOtp(email, code);
      login(result.token, result.investor);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid or expired code. Please try again.',
      );
      setDigits(Array.from({ length: CODE_LENGTH }, () => ''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      await requestOtp(email);
    } catch {
      setError('Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-papaya-lightest px-4">
      <div className="w-full max-w-md">
        {/* Logo / Branding */}
        <div className="mb-8 text-center">
          <img src="/papaya-logo.png" alt="Papaya" className="mx-auto mb-4 h-10" />
          <h1 className="text-2xl font-bold text-foreground">Verify Your Email</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the 6-digit code sent to{' '}
            <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-lg">Enter Code</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* OTP Digit Inputs */}
              <div
                className="flex justify-center gap-2"
                onPaste={handlePaste}
              >
                {digits.map((digit, i) => (
                  <Input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    disabled={loading}
                    className="h-12 w-12 text-center text-lg font-semibold"
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              {error && (
                <p className="text-center text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || digits.some((d) => !d)}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </Button>

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/login')}
                  className="text-muted-foreground"
                >
                  <ArrowLeft className="size-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResend}
                  disabled={resending}
                  className="text-muted-foreground"
                >
                  {resending ? 'Sending...' : 'Resend Code'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
