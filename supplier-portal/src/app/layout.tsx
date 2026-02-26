import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SuperMandi Supplier Portal',
  description: 'Manage your products and orders on SuperMandi',
  icons: {
    icon: '/supplier/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: inline theme script mutates class before hydration (intentional mismatch)
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* REQ.AUTH.THEME.ICON_TOGGLE_PARITY: Apply persisted theme before React hydrates to prevent FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('supermandi-theme')==='dark')document.documentElement.classList.add('dark');}catch(e){}})()`,
          }}
        />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
