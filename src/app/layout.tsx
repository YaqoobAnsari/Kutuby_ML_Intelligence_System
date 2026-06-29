import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/app/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

/** Static metadata for the dashboard shell. */
export const metadata: Metadata = {
  title: 'Kutuby ML Intelligence',
  description:
    'Internal, read-only ML observability for Kutuby pronunciation models.',
};

/**
 * Root layout: sets up fonts, base theming, and global providers.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} bg-background text-foreground antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
