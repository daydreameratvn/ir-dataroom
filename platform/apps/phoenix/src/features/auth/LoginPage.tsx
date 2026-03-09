import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { login as apiLogin } from '@/lib/api';
import { usePhoenixAuth } from '@/providers/PhoenixAuthProvider';
import type { PolicyInfo } from '@/lib/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated } = usePhoenixAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Already authenticated — redirect to home
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Auto-login from URL params: /login?policyNumbers=287686,287687
  useEffect(() => {
    const raw = searchParams.get('policyNumbers');
    if (!raw) return;

    const numbers = raw
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    if (numbers.length === 0) return;

    let cancelled = false;

    async function doLogin() {
      setIsLoggingIn(true);
      setError(null);

      try {
        const results = await apiLogin(numbers);
        if (cancelled) return;

        const policies: PolicyInfo[] = [];
        const tokens: Record<string, string> = {};

        for (const r of results) {
          if (r.success && r.token && r.policy) {
            policies.push(r.policy);
            tokens[r.policyNumber] = r.token;
          }
        }

        if (policies.length === 0) {
          setError('Số hợp đồng không hợp lệ hoặc không tồn tại.');
          return;
        }

        login(policies, tokens);
        navigate('/', { replace: true });
      } catch {
        if (!cancelled) {
          setError('Đã xảy ra lỗi. Vui lòng thử lại.');
        }
      } finally {
        if (!cancelled) {
          setIsLoggingIn(false);
        }
      }
    }

    void doLogin();
    return () => { cancelled = true; };
  }, [searchParams, login, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      {/* TechcomLife Header */}
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#E30613]">
          <span className="text-2xl font-bold text-white">TC</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">TechcomLife</h1>
        <p className="mt-1 text-sm text-gray-500">Cổng bồi thường bảo hiểm</p>
      </div>

      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        {isLoggingIn && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-[#E30613]" />
            <p className="text-sm text-gray-500">Đang đăng nhập...</p>
          </div>
        )}

        {!isLoggingIn && error && (
          <div className="space-y-4">
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
            <p className="text-center text-sm text-gray-500">
              Vui lòng kiểm tra lại đường dẫn hoặc liên hệ hotline để được hỗ trợ.
            </p>
          </div>
        )}

        {!isLoggingIn && !error && (
          <div className="space-y-4 py-4 text-center">
            <p className="text-sm text-gray-500">
              Vui lòng sử dụng đường dẫn được cung cấp để đăng nhập.
            </p>
            <p className="text-xs text-gray-400">
              Đường dẫn có dạng: /login?policyNumbers=...
            </p>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Powered by Papaya
      </p>
    </div>
  );
}
