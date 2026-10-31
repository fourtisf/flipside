'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { TradeStore } from '@/trade/store';
import { AccountStore } from './account';
import { WalletStore } from './store';

const Ctx = createContext<{ wallet: WalletStore; account: AccountStore; trade: TradeStore } | null>(null);

/** The connected wallet and its Hyperliquid account, for the whole live edition. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [stores] = useState(() => {
    const wallet = new WalletStore();
    return { wallet, account: new AccountStore(), trade: new TradeStore(wallet) };
  });
  useEffect(() => stores.wallet.start(), [stores]);
  // the account and the trading key follow whatever address the wallet has
  useEffect(() => {
    const { wallet, account, trade } = stores;
    const sync = () => {
      account.follow(wallet.address);
      trade.follow(wallet.address);
    };
    sync();
    const off = wallet.subscribe(sync);
    return () => {
      off();
      account.follow(null);
      trade.follow(null);
    };
  }, [stores]);
  return <Ctx.Provider value={stores}>{children}</Ctx.Provider>;
}

function useStores() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useWallet must be used inside <WalletProvider>');
  return s;
}

export function useWallet(): WalletStore {
  const { wallet } = useStores();
  useSyncExternalStore(wallet.subscribe, wallet.getVersion, wallet.getVersion);
  return wallet;
}

export function useTrade(): TradeStore {
  const { trade } = useStores();
  useSyncExternalStore(trade.subscribe, trade.getVersion, trade.getVersion);
  return trade;
}

export function useAccount(): AccountStore {
  const { account } = useStores();
  useSyncExternalStore(account.subscribe, account.getVersion, account.getVersion);
  return account;
}
