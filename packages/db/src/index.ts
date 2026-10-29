import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

const g = globalThis as unknown as { __coinsidePrisma?: PrismaClient };

/** One client per process. Reused across hot reloads in dev. */
export const prisma: PrismaClient = g.__coinsidePrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.__coinsidePrisma = prisma;
