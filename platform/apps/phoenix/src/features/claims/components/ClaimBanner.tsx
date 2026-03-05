import { LogOut, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { usePhoenixAuth } from '@/providers/PhoenixAuthProvider';

export default function ClaimBanner() {
  const { activePolicy, policies, switchPolicy, logout } = usePhoenixAuth();
  const [showPolicySwitcher, setShowPolicySwitcher] = useState(false);

  return (
    <div className="bg-[#E30613] px-4 pb-6 pt-4 text-white">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-medium">TechcomLife</div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          Đăng xuất
        </button>
      </div>

      {/* Greeting */}
      <h1 className="text-lg font-bold">
        Xin chào, {activePolicy?.insuredName ?? 'Quý khách'}
      </h1>

      {/* Policy selector */}
      {policies.length > 1 && (
        <div className="relative mt-2">
          <button
            onClick={() => setShowPolicySwitcher(!showPolicySwitcher)}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs"
          >
            HĐ: {activePolicy?.policyNumber}
            <ChevronDown className="h-3 w-3" />
          </button>

          {showPolicySwitcher && (
            <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-lg bg-white py-1 text-gray-900 shadow-lg">
              {policies.map((p) => (
                <button
                  key={p.policyNumber}
                  onClick={() => {
                    switchPolicy(p.policyNumber);
                    setShowPolicySwitcher(false);
                  }}
                  className={`flex w-full flex-col px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                    p.policyNumber === activePolicy?.policyNumber
                      ? 'bg-red-50 font-medium'
                      : ''
                  }`}
                >
                  <span className="font-medium">{p.policyNumber}</span>
                  <span className="text-xs text-gray-500">{p.insuredName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {policies.length === 1 && (
        <p className="mt-1 text-sm text-white/70">
          HĐ: {activePolicy?.policyNumber}
        </p>
      )}
    </div>
  );
}
