'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AccountStore } from './account';
import { WalletStore } from './store';

const Ctx = createContext<{ wallet: WalletStore; account: AccountStore } | null>(null);

/** The connected wallet and its Hyperliquid account, for the whole live edition. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [stores] = useState(() => ({ wallet: new WalletStore(), account: new AccountStore() }));
  useEffect(() => stores.wallet.start(), [stores]);
  // the account follows whatever address the wallet has
  useEffect(() => {
    const { wallet, account } = stores;
    const sync = () => account.follow(wallet.address);
    sync();
    const off = wallet.subscribe(sync);
    return () => {
      off();
      account.follow(null);
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

export function useAccount(): AccountStore {
  const { account } = useStores();
  useSyncExternalStore(account.subscribe, account.getVersion, account.getVersion);
  return account;
}
