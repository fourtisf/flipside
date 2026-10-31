import type { Metadata, Viewport } from 'next';
import { GeistMono } from 'geist/font/mono';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { Footer, FundDialog, TabBar, Toasts, WalletDialog } from '@/components/Shell';
import { ConnectDialog, WalletMenu } from '@/components/live/Wallet';
import { HlProvider } from '@/hl/provider';
import { LIVE } from '@/lib/edition';
import { SimProvider } from '@/mock/provider';
import { WalletProvider } from '@/wallet/provider';
import './globals.css';

// Same families as the prototype's Google Fonts link (Inter 400-700, Geist Mono), self-hosted.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const COPY = LIVE
  ? {
      title: 'Coinside: long or short on Hyperliquid from your Solana wallet',
      description:
        "Go long or short on SOL, BTC and every Hyperliquid market from your Solana wallet. Orders fill on Hyperliquid's order book.",
      og: 'Long or short on every Hyperliquid market, from your Solana wallet. Your funds stay in your own account.',
    }
  : {
      title: 'Coinside: long or short any Solana coin',
      description:
        'Paste a Solana contract address and go long or short at up to 10x, filled against the pool.',
      og: 'Paste a contract address, pick a side, up to 10x. Filled against an on-chain pool.',
    };

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: { default: COPY.title, template: '%s · Coinside' },
  description: COPY.description,
  openGraph: { title: COPY.title, description: COPY.og },
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
        {LIVE ? (
          // coinside.fun: live Hyperliquid markets, read only
          <HlProvider>
            <WalletProvider>
              <Header />
              <main>{children}</main>
              <Footer />
              <TabBar />
              <ConnectDialog />
              <WalletMenu />
            </WalletProvider>
          </HlProvider>
        ) : (
          <SimProvider>
            <Header />
            <main>{children}</main>
            <Footer />
            <TabBar />
            <FundDialog />
            <WalletDialog />
            <Toasts />
          </SimProvider>
        )}
      </body>
    </html>
  );
}
