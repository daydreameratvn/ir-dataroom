"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Shield } from "lucide-react";

const tabs = [
  { label: "Documents", href: "/dataroom", icon: FileText },
  { label: "NDA", href: "/dataroom/nda", icon: Shield },
];

export function DataroomTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b bg-white px-6">
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/dataroom"
            ? pathname === "/dataroom" || pathname.startsWith("/dataroom/file")
            : pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
              ${
                isActive
                  ? "border-b-2 border-slate-900 text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
