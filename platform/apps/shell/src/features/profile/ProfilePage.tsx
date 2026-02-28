import { useTranslation } from 'react-i18next';
import {
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
} from '@papaya/shared-ui';
import { Mail, Building2, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '@papaya/auth';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6">
      <PageHeader title={t('auth.profile')} />

      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user.avatarUrl} alt={user.name} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <CardTitle className="text-xl">{user.name}</CardTitle>
                {user.title && (
                  <p className="text-sm text-muted-foreground">{user.title}</p>
                )}
                <div className="flex gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {user.userLevel}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {user.userType}
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="size-4 text-muted-foreground" />
              <span>{user.email}</span>
            </div>
            {user.department && (
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="size-4 text-muted-foreground" />
                <span>{user.department}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <ShieldCheck className="size-4 text-muted-foreground" />
              <span className="capitalize">{user.userLevel} access</span>
            </div>
          </CardContent>
        </Card>

        <Button variant="outline" className="w-full" onClick={signOut}>
          <LogOut className="size-4" />
          {t('auth.signOut')}
        </Button>
      </div>
    </div>
  );
}
