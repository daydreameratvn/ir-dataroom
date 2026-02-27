import { Outlet } from 'react-router-dom';
import { Button } from '@papaya/shared-ui';
import { LogOut } from 'lucide-react';
import { useInvestorAuth } from '@/providers/InvestorAuthProvider';

export default function InvestorLayout() {
  const { investor, logout } = useInvestorAuth();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">P</span>
            </div>
            <span className="text-sm font-semibold text-foreground">
              Investor Portal
            </span>
          </div>

          {/* User Info + Logout */}
          <div className="flex items-center gap-3">
            {investor && (
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-foreground">
                  {investor.name}
                </p>
                {investor.firm && (
                  <p className="text-xs text-muted-foreground">
                    {investor.firm}
                  </p>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={logout}
              title="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t py-4">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-center text-xs text-muted-foreground">
            Confidential. For authorized investors only. Powered by Papaya.
          </p>
        </div>
      </footer>
    </div>
  );
}
