import type { Metadata, Viewport } from 'next';
import { GeistMono } from 'geist/font/mono';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { Footer, FundDialog, TabBar, Toasts, WalletDialog } from '@/components/Shell';
import { SimProvider } from '@/mock/provider';
import './globals.css';

// Same families as the prototype's Google Fonts link (Inter 400-700, Geist Mono), self-hosted.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: { default: 'Flipside: long or short any Solana coin', template: '%s · Flipside' },
  description: 'Paste a Solana contract address and go long or short at up to 10x, filled against the pool.',
  openGraph: {
    title: 'Flipside: long or short any Solana coin',
    description: 'Paste a contract address, pick a side, up to 10x. Filled against an on-chain pool.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${GeistMono.variable}`}>
      <body>
        <SimProvider>
          <Header />
          <main>{children}</main>
          <Footer />
          <TabBar />
          <FundDialog />
          <WalletDialog />
          <Toasts />
        </SimProvider>
      </body>
    </html>
  );
}
