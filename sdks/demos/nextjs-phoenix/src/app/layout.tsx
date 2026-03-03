import type { Metadata } from 'next';
import { PartnerHeader } from '@/components/PartnerHeader';
import './globals.css';

export const metadata: Metadata = {
  title: 'Partner Demo — Phoenix SDK',
  description: 'Next.js demo app embedding the Phoenix React SDK',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <PartnerHeader />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
