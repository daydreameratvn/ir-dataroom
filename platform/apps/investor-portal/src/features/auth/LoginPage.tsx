import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@papaya/shared-ui';
import { Loader2 } from 'lucide-react';
import { requestOtp } from '@/lib/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await requestOtp(email.trim());

      // Enforce layer: only navigate if backend explicitly confirmed OTP was sent.
      // 1. Show server error messages (4xx responses parsed by apiFetch)
      // 2. Reject stale backend responses that return 200 for all emails
      //    (old backend: "If an account exists..." — new backend: "OTP sent to email")
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (!result?.success || result?.message !== 'OTP sent to email') {
        setError("Looks like you don't have access yet — reach out to khanh@papaya.asia and we'll get you set up 🙌");
        return;
      }

      navigate(`/verify?email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to send verification code. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-papaya-lightest px-4">
      <div className="w-full max-w-md">
        {/* Logo / Branding */}
        <div className="mb-8 text-center">
          <img src="/papaya-logo.png" alt="Papaya" className="mx-auto mb-4 h-10" />
          <h1 className="text-2xl font-bold text-foreground">Investor Portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Access your investment data room
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-lg">Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-foreground"
                >
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="investor@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  disabled={loading}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !email.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending Code...
                  </>
                ) : (
                  'Send Code'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Only authorized investors can access this portal.
          <br />
          Contact khanh@papaya.asia if you need access. 🤝
        </p>
      </div>
    </div>
  );
}
