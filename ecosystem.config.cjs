/**
 * PM2 processes (CLAUDE.md section 13). The engine is the single writer for the book and ledger:
 * exactly one instance, fork mode, never clustered.
 *
 * On the server, coinside-deploy starts this file with COINSIDE_ROOT=/srv/coinside/current, so every
 * path goes through the `current` symlink and a reload picks up the newly switched release. Variables
 * come from COINSIDE_ENV_FILE (default /etc/coinside/coinside.env) when that file exists, parsed the
 * same way as Node's --env-file. PM2 re-reads this file on every reload (`--update-env`) but not the
 * shell's environment, so anything a process needs, like the release name, has to be listed here.
 */
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { parseEnv } = require('node:util');

const root = process.env.COINSIDE_ROOT ?? __dirname;
const envFile = process.env.COINSIDE_ENV_FILE ?? '/etc/coinside/coinside.env';
const env = {
  ...(existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}),
  COINSIDE_RELEASE: process.env.COINSIDE_RELEASE ?? 'dev',
  NEXT_TELEMETRY_DISABLED: '1',
};

const common = {
  exec_mode: 'fork',
  instances: 1,
  autorestart: true,
  max_restarts: 20,
  exp_backoff_restart_delay: 200,
  time: true,
  env,
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'web',
      cwd: join(root, 'apps/web'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 127.0.0.1 -p 3000',
      // Two workers behind one port, so `pm2 reload web` replaces them one at a time with no downtime.
      exec_mode: 'cluster',
      instances: Number(process.env.WEB_INSTANCES ?? 2),
      merge_logs: true,
    },
    {
      ...common,
      name: 'api',
      cwd: join(root, 'apps/api'),
      script: 'dist/index.js',
      // Stateless: shared state lives in Postgres and Redis from P2. Two workers for the same reason as web.
      exec_mode: 'cluster',
      instances: Number(process.env.API_INSTANCES ?? 2),
      merge_logs: true,
    },
    {
      ...common,
      name: 'engine',
      cwd: join(root, 'apps/engine'),
      script: 'dist/index.js',
      kill_timeout: 10000,
    },
    { ...common, name: 'indexer', cwd: join(root, 'apps/indexer'), script: 'dist/index.js' },
    { ...common, name: 'worker', cwd: join(root, 'apps/worker'), script: 'dist/index.js' },
  ],
};
