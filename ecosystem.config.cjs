/**
 * PM2 processes (CLAUDE.md section 13). The engine is the single writer for the book and ledger:
 * exactly one instance, fork mode, never clustered.
 */
const common = { exec_mode: 'fork', instances: 1, autorestart: true, max_restarts: 20, time: true };

module.exports = {
  apps: [
    {
      ...common,
      name: 'web',
      cwd: 'apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
    },
    { ...common, name: 'api', cwd: 'apps/api', script: 'dist/index.js' },
    { ...common, name: 'engine', cwd: 'apps/engine', script: 'dist/index.js', kill_timeout: 10000 },
    { ...common, name: 'indexer', cwd: 'apps/indexer', script: 'dist/index.js' },
    { ...common, name: 'worker', cwd: 'apps/worker', script: 'dist/index.js' },
  ],
};
