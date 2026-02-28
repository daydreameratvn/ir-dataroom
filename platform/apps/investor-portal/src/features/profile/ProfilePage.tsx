import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@papaya/shared-ui';
import { ArrowLeft, LogOut, Mail, Building2, User } from 'lucide-react';
import { useInvestorAuth } from '@/providers/InvestorAuthProvider';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { investor, logout } = useInvestorAuth();

  if (!investor) return null;

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-bold text-foreground">Profile</h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
              <span className="text-xl font-semibold text-primary">
                {investor.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <CardTitle className="text-lg">{investor.name}</CardTitle>
              {investor.firm && (
                <p className="text-sm text-muted-foreground">{investor.firm}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="size-4 text-muted-foreground" />
            <span>{investor.email}</span>
          </div>
          {investor.firm && (
            <div className="flex items-center gap-3 text-sm">
              <Building2 className="size-4 text-muted-foreground" />
              <span>{investor.firm}</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm">
            <User className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Investor</span>
          </div>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="w-full"
        onClick={logout}
      >
        <LogOut className="size-4" />
        Sign Out
      </Button>
    </div>
  );
}
