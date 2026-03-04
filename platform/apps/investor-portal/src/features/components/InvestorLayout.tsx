import { Link, Outlet } from 'react-router-dom';
import { Button } from '@papaya/shared-ui';
import { LogOut } from 'lucide-react';
import { useInvestorAuth } from '@/providers/InvestorAuthProvider';

export default function InvestorLayout() {
  const { investor, logout } = useInvestorAuth();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* Brand accent line */}
        <div className="h-0.5 bg-primary" />
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          {/* Logo */}
          <Link to="/rounds" className="flex items-center gap-2.5">
            <img src="/papaya-logo.png" alt="Papaya" className="h-7" />
            <span className="text-sm font-medium text-muted-foreground">|</span>
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Investor Portal
            </span>
          </Link>

          {/* User Info + Logout */}
          <div className="flex items-center gap-3">
            {investor && (
              <Link
                to="/profile"
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-semibold text-primary">
                    {investor.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium leading-tight text-foreground">
                    {investor.name}
                  </p>
                  {investor.firm && (
                    <p className="text-xs leading-tight text-muted-foreground">
                      {investor.firm}
                    </p>
                  )}
                </div>
              </Link>
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
      <footer className="border-t bg-muted/30 py-6">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-center text-xs text-muted-foreground">
            Private and Strictly Confidential. For authorized investors only.
          </p>
        </div>
      </footer>
    </div>
  );
}
