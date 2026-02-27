import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/components/auth/SignOutButton";
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  BarChart3,
  Settings,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/investors", label: "Investors", icon: Users },
  { href: "/admin/files", label: "Files", icon: FolderOpen },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  const admin = await prisma.adminUser.findUnique({
    where: { email: session.user.email },
  });

  if (!admin) {
    redirect("/");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-zinc-950 text-zinc-100 flex flex-col">
        <div className="p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/papaya-logo.png"
            alt="Papaya"
            className="h-7 w-auto"
          />
          <p className="text-xs text-zinc-400 mt-2 truncate">
            {session.user.email}
          </p>
        </div>
        <Separator className="bg-zinc-800" />
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Separator className="bg-zinc-800" />
        <div className="p-4">
          <SignOutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-zinc-50">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
