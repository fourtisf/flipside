/**
 * Mock data for P0. Fictional coins and addresses, copied from the prototype's seed so every view
 * renders the same markets. Replaced by the markets API and WebSocket in P1 and the engine in P2.
 * Addresses are fixed (not random per load) so /trade/[mint] URLs are stable.
 */
export const VENUES = ['pump.fun', 'PumpSwap', 'Raydium', 'StonkFun', 'Meteora'] as const;
export type Venue = (typeof VENUES)[number];

export interface CoinSeed {
  sym: string;
  name: string;
  venue: Venue;
  mint: string;
  mcapUsd: number;
  /** SOL side of the coin's pools. */
  liquiditySol: number;
  /** Per-second volatility of the simulated random walk. */
  vol: number;
}

export const COINS: readonly CoinSeed[] = [
  {
    sym: 'GLOOP',
    name: 'Gloop',
    venue: 'PumpSwap',
    mint: 'AK6sDVobPJFuVSuepJF6QdZYvT9R4RqnerRJ8P5qpump',
    mcapUsd: 4.8e6,
    liquiditySol: 612,
    vol: 0.006,
  },
  {
    sym: 'SKRIMP',
    name: 'Skrimp',
    venue: 'pump.fun',
    mint: 'DXtcZrcieDw6fXP6EBXkqWQ8vFEVRiBEgDiXnQwGpump',
    mcapUsd: 386e3,
    liquiditySol: 171,
    vol: 0.011,
  },
  {
    sym: 'MOGRA',
    name: 'Mogra',
    venue: 'Raydium',
    mint: 'h1ubyk4nHagJyJyHzKHqJ3D4fvNaBtfmAeE3zaE5Xh9S',
    mcapUsd: 12.4e6,
    liquiditySol: 1840,
    vol: 0.004,
  },
  {
    sym: 'TAXI',
    name: 'Robotaxi',
    venue: 'StonkFun',
    mint: 'g6gQqQ9gbj4ZeCzMD7Axc6374RDsP4PjsfAowQkxPyza',
    mcapUsd: 2.1e6,
    liquiditySol: 402,
    vol: 0.007,
  },
  {
    sym: 'HOODIE',
    name: 'Hoodie',
    venue: 'PumpSwap',
    mint: 'HTruvSKF9CUsQrnTjNxNFcNDSvnJnrjHuiJdKckKpump',
    mcapUsd: 932e3,
    liquiditySol: 238,
    vol: 0.009,
  },
  {
    sym: 'FERN',
    name: 'Fern',
    venue: 'Meteora',
    mint: '7kEtT8T4NiGKpnT5ddMbhayaYpxPcjSChHzk2QD4G9kX',
    mcapUsd: 61e3,
    liquiditySol: 58,
    vol: 0.013,
  },
  {
    sym: 'BLORP',
    name: 'Blorp',
    venue: 'pump.fun',
    mint: 'GtA4cSTPAciQYuhNLmit3fELyzDT2fP4j4mpszFMpump',
    mcapUsd: 148e3,
    liquiditySol: 92,
    vol: 0.013,
  },
  {
    sym: 'KELP',
    name: 'Kelp',
    venue: 'Raydium',
    mint: '9CZbPcwKhrm6S3fJ2qVarJ1XTrrJBKwuRkrmZJ33U5uK',
    mcapUsd: 27.5e6,
    liquiditySol: 4210,
    vol: 0.003,
  },
  {
    sym: 'WOBBLE',
    name: 'Wobble',
    venue: 'PumpSwap',
    mint: 'AmHqcK5vAo1XMc9mm3L9Ck3enZs5PD1tUUQQubfbpump',
    mcapUsd: 3.3e6,
    liquiditySol: 520,
    vol: 0.008,
  },
  {
    sym: 'NOODL',
    name: 'Noodle',
    venue: 'StonkFun',
    mint: 'RTzCUiofBvpqWVAeorv34Fae5mL7YWTa9i9LLhJdvDoV',
    mcapUsd: 740e3,
    liquiditySol: 205,
    vol: 0.009,
  },
  {
    sym: 'CHAD',
    name: 'Chad',
    venue: 'PumpSwap',
    mint: 'GUZsWctYZRG4zbbwi1HjBQZngJbjFSsjcNiGDc8jpump',
    mcapUsd: 18.9e6,
    liquiditySol: 2950,
    vol: 0.004,
  },
  {
    sym: 'PIXL',
    name: 'Pixel',
    venue: 'pump.fun',
    mint: 'D4xzVf2i6vqLkF4tgPf2imyh3rBiT1jEjJcxpRzppump',
    mcapUsd: 95e3,
    liquiditySol: 64,
    vol: 0.015,
  },
  {
    sym: 'GRITS',
    name: 'Grits',
    venue: 'Raydium',
    mint: 'EVcyUiJV8qihr5Mqq1gwPcxTJHncy3kL5hH5hvP5R1ef',
    mcapUsd: 1.6e6,
    liquiditySol: 330,
    vol: 0.007,
  },
  {
    sym: 'ZOOM',
    name: 'Zoomer',
    venue: 'PumpSwap',
    mint: 'Lvn7AckpjzhHeiXh4se43xxmP9ShQ5XH8jiMceeapump',
    mcapUsd: 5.7e6,
    liquiditySol: 880,
    vol: 0.006,
  },
  {
    sym: 'MOLT',
    name: 'Molt',
    venue: 'Meteora',
    mint: 'q3P8PyvXjJFhhZX8S6RyedtCLP5dNAXh5SGaguT52Ahy',
    mcapUsd: 420e3,
    liquiditySol: 140,
    vol: 0.01,
  },
  {
    sym: 'SPRK',
    name: 'Sparkle',
    venue: 'StonkFun',
    mint: 'a1iLEHStJQLYn8XGhz4bZ4hig7kCKATP4woL3vH28p3r',
    mcapUsd: 8.8e6,
    liquiditySol: 1320,
    vol: 0.005,
  },
  {
    sym: 'DUNK',
    name: 'Dunk',
    venue: 'pump.fun',
    mint: 'sHsRHVeD1n2bHX4zEYXAqNxpnxE8QCPZaUMwbLUrpump',
    mcapUsd: 212e3,
    liquiditySol: 110,
    vol: 0.012,
  },
  {
    sym: 'OBVS',
    name: 'Obverse',
    venue: 'Raydium',
    mint: 'HxuMzBN9J4ed4zKeri897gao24qwznN3sgPgZFwUs6HT',
    mcapUsd: 44.2e6,
    liquiditySol: 6100,
    vol: 0.003,
  },
  {
    sym: 'TOAD',
    name: 'Toad',
    venue: 'PumpSwap',
    mint: 'dScu52fqygBhb84uY1mujJdWomSZhiGRsgzjw8tcpump',
    mcapUsd: 1.1e6,
    liquiditySol: 260,
    vol: 0.008,
  },
  {
    sym: 'YAWN',
    name: 'Yawn',
    venue: 'pump.fun',
    mint: 'xMZF8veZNqQ4jvPC8JNQeLop9CXc42y2aoG5TdU2pump',
    mcapUsd: 77e3,
    liquiditySol: 52,
    vol: 0.016,
  },
  {
    sym: 'GRAVY',
    name: 'Gravy',
    venue: 'PumpSwap',
    mint: '7CPuwfJyjYrGu4ctJSWUF14C1bVxTggwnvJ2b3xVpump',
    mcapUsd: 2.7e6,
    liquiditySol: 470,
    vol: 0.007,
  },
  {
    sym: 'LUMEN',
    name: 'Lumen',
    venue: 'StonkFun',
    mint: 'r4AF3xRGs1pbrAaFPBbzmdtFs5MqhnzeEzb9xVK7qXgZ',
    mcapUsd: 15.1e6,
    liquiditySol: 2210,
    vol: 0.004,
  },
];

/** The coin the rug guard demo pulls at t = 40 s, exactly like the prototype. */
export const RUG_DEMO_SYM = 'FERN';
export const DEFAULT_SYM = 'GLOOP';
export const DEFAULT_MINT = COINS.find((c) => c.sym === DEFAULT_SYM)!.mint;
export const MINTS: ReadonlySet<string> = new Set(COINS.map((c) => c.mint));

/** Other traders shown in the feed, tape and wins. */
export const TRADERS: readonly string[] = [
  'tZYbqaK5HmA1DYYyjmBDcdUtopJbvpfev7phDLCZ7tk3',
  'RkAHkHHMWRENRofLQyjpTHVtS2nY8fVQejaYhd1Ri6L8',
  'faqQCrBubfy5siKYEdBdS62jb9fseAEZMdwckPGYC8bv',
  'jpiZ2UrzKnMQG6VFCtVk4imhARmy1JkANgARbWrRRwyP',
  '9vzcrr5usB9zcDudsJRMBzUhbQieobLvzReuGQbzoxRZ',
  'CTA2ZSX6j1nBFizVKsfNSbH777fHytVQ84cY7KTGDvs5',
  'RmdAuofrnuX2WRpgbNu61sdV796y3dzFPgGr1WfZaPy2',
  'gJiy3dt481mFS493mD2EGQ6VuEQk72P7w5YvbEmgoDwN',
  'p1aMzN4igDdfzn5kZ3VxXZf7LGaKn6a9ZAudfmij8hFN',
  'Das1b2Aud5PAfaq4tqFkFsX2kG97Bi5ijEf2faji6LsM',
  'Ed4aUySbtyyQPvqJwxXgUajLb18NxMNbxEEhrHPnAwbW',
  'M856HqmPXgULtp67tB2r6H33LxbpTAx35jQvCCn3KjaT',
  'brTSFCWh99V4qHm69isqRuBcF2ygSz95eSM2EVYtkf7Q',
  '1AABzx4Bc7k6Qo4JJMEsLYd84qqPbyiY3i1PCWVT1qWt',
  'rNtTbgbQDbnZghxY9Z2XJugRjUKyYGCZieej3hrCk85M',
  'GsrhrwnC1mm7ribnNr6xp6BHovP1xvHgWZLmfSp5SvFb',
  'TaGM7dYbSRcSisMojEbJHUhqzDgfP7ZDWeT8ve6mJrof',
  'rcjKEf1CoNi68An3ZFLieUkfFDrchzUzExVmHV5QrLLo',
  'V7edUN715JhvWqTsxYhAkbGTMc6hSwnW5wsNXQ7ee8UV',
  'Q3guNdZQezjerTHW6prBnKYrizWPRy4J5uydMoEMPcN8',
  'yzYUVkbQBf1ggi6C6q2CGUoB5cLZpWSgD5W3GY9Ge9Y8',
  'cGuUffzvKSVpQ2oGr9harS1j69dH5wR1tk142y5hSkMN',
  'jPwFa8Has7pN6EnYLf3Cf5tBBXLNx2jCTGszhbDPBe3t',
  'hqknAMyZy8Xh6cnHyZQfrwQ37TgjCXHgM1VrrmWfZiVh',
  '22zkPrxwD8JDuEZaBxbePLN4AoA9kCMsne17v3ZWG2Hm',
  'hqUWVQs1MSKj6TP1geWe3vGZBjxmYuWRFLDmGBt5pLFw',
  'ySBm1uQbiWJsuZ6urVqABsizqhKrUdTrThux41DB95pG',
  '1xvshCqKAQZjoMi33LCYd5XXY5Hp22KVt54sgA18Dueb',
  'if87mgrBasgThUiJrRFasZFg9wqyya4EofozYAWiNz5Y',
  'PxDw3Y7ePpSRPtLNmGwGZYpXqBF1hDQ7H63fFPC1v3Fx',
  'aR5gUD1mN6S3TsQG9ibD6m9ZUua7ijpVbt1AM4syEPHB',
  'R2UxuLwhJpsyVyePgvi2cjVAXBaTLKAjmHmBKCzHHVNL',
  'gRY82kcsFBdswc2iyUDrs24KrjFkcSq11q4Yb8Uareh7',
  '4VAV56qnR6zP4bEXv59o7Y58z73f8WKSoToG8cSGha3j',
  'ZpFpCMRQc9JVoAD8UzvULdPzSsUXFd3jUC5Pj9Fnb6Jh',
  '24KgVQGzoGBdX8DJduWcMU6Y4iYBj9n442wZ58Dq66XU',
  'HcmTHEt4Nk4NucgEVkpukt26XoeefAsWEjJUSsTX8YSV',
  '8sMsgJe9Zwy9gjAhoh11owEn1bDgp9n1NwNnrq1CM9Dh',
  'Kcou8kjTEti9RKbWu1bYkYWFFaWKHDB5EGy3d7yN85Wp',
  'PNfpUJewKCYNSUSwwwJkioio3btWfXoZuNfampZhayyu',
];

/** Wallets handed out by the mock connect flow and the leaderboard. */
export const WALLETS: readonly string[] = [
  '5RY54EuVbWdmW6U6h77QSMbSuTefQJZdSj2dYyxD9rei',
  'FJmRyb6XNhRXHdabatatNqstzDEzTrrHPnzgfHDBi7r2',
  'bDeDdfq5fVmmC1pmr7TExqxdcxhnU49XApvHn3Lb9vsW',
  'gu934zQrJ2TJnpDUSVqG2voJsmNf3ACkAeGcUNkZP9uN',
  'kCcd8GiuS7LyEWddNFx8eGpJ1x7DKoZU18AjUC73Sw1c',
  'MTT2ncaRLoxWkiEAmczx3zHrHUCizbLwyKWTeBMf6Vfz',
  '1Jqzjrzsuf983WGfHBicSGm6nYJ8YvqjaJcn8tnAx5Uo',
  'YiNv6PpVVVtKrEW3xAvCzFU4HXdJno8WnXFWxx9fMg7C',
  'P3yJVR1BK8cuv8NYJRQjoGEVzcygoV61hJtXDdT3uGWN',
  '6c77FAmechh1JfKwBKVXwoTaZZ2sxDBsiSR2CkBtJZ9m',
  '4bNCCvm7H5vyLm4GtUkh2w5TiZxiTsK2h4FBBgv3Q9X6',
  'yaXTRF4m7Z21DTjasNYczahufpzGVtB2rDvDDygnmpJ3',
  'mukU41DjAzmpAhiZ8oYYTbp6p1G8xYgvvsq44nUQBCd7',
  '3qEGomy4inefng5sMcqqLCUinRzwywSwJvRQv7wry8V5',
  'JHfhERRU9W567oSRSxTemfRqevKiAK71yVCFHiD6gVNz',
  'Q6qrKhhj3Lj9SfMGDqwPPVYhz3iSyJvK4KBLngkteKEZ',
  'uthi1Sk4eaP2f19XetMxpQhPVQfQ7u5MX1Y5Ey6TV57N',
  'Wco4n8fWNUWYqzrZ3pfnZTV4QfX1VMYKMeyWSvPXR2ps',
  'YEqHWAW8VFkrCWcn4w9mH32YkbAFwxwUgdUs3eZdhfFC',
  'd8rqbjBMMFjcRayEsx6ueGfXq9dTK8bsWyq7isLXwWQh',
  'ecUw7bF8nCFKwrdAbvQSV7MWMKaSfr3UVZ2LGJWDhpw5',
  'gLTNddidz3sXeGt7LwDdKE1GMN52jkEvh3cHWZokf2ja',
  'quRQdbUg2WGdzMtDX3wyLece7kpG8qNUQf1ogjeL9j8j',
  'Q8uV4kmCK1geCspjyixMyuEg77XXcDgLAkFMgU1THdaK',
  'pVaewxry7b8DAnhv1bz3wBedyij4QHcTL8Ua3wTEazad',
  'UJKXaa9QSubA7AUw4G2bTbNArDPUzwYt7XYotkLmNGvk',
  'YofNGJAAbx7kSTni75u5WAFc2kYJBJTaJfyA6W9Cjoix',
  'aYJLBd85wJdFzs3QQPaf8YsahXiEY3XPeKnwekfcxpJc',
  'CEP4criBXjyi1gdBNQZFLdiKLoNeamAVNe8cwwGBBiJ4',
  'DCecSFhNVRauaGrcP1t3CKsiH9R78Up1fk8MSYVJ9q8G',
  '5GDAs87Ld1t1hrm9GpPrdgymzxszRPq4D4oRxQ5dqTD6',
  'NZsToLjYvGtaSypoD6pdXWWWX3RGuNbY8hobBWfSDTbk',
];

/** Wallets the mock connect flow hands out (never one of the traders above). */
export const USER_WALLETS: readonly string[] = [
  'kZDmZa94DUfybyBi7rxt7yAxz2Wrsr2BJCp9kuvSrwzD',
  'D3moKRHuTT1LY4ykrocRrCu1qW9j1DfAwsPMS9fgpHjY',
  'hCuY5iq4CimYrzBeiygdYnyj8tw2vysk6F8nMWV7nVaW',
  'uR7ygwujKrw4suJzWF5G5egYGm1voYtXXRcJHepuijQs',
];

/** Protocol figures at load, in SOL (converted to lamports by the mock engine). */
export const PROTOCOL = {
  poolSol: '418.62',
  poolShares: '399.75',
  usersOwedSol: '179.84',
  bufferSol: '13.78',
  paid24Sol: '121.36',
  vol24Sol: '1284.6',
  trades24: 6412,
  competitionPotSol: '9.62',
  balanceRootEpoch: 4127,
  balanceRootHex: '9f3c1e7a52b04d8e6a1f0c9b3d72e5a48c16f0b2e9d7a3c5418b6e0f2d9c7a14',
} as const;

/** Seed for the deterministic random walk, so the server render and the client agree. */
export const SIM_SEED = 0xf11b5;
