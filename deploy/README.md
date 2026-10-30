# Deploying Coinside

One Ubuntu server (22.04 or 24.04) runs everything. Nginx is the only thing reachable from the internet;
PM2 runs the five processes behind it. Everything the server needs is in this folder. Nothing is edited
by hand on the server except the environment file.

```
Internet ──▶ Nginx :443 ──▶ web      127.0.0.1:3000   Next.js, 2 workers   (default ports; see below)
              (TLS, headers,  └▶ api   127.0.0.1:4000   /api and /ws, 2 workers
               rate limit)       engine  127.0.0.1:4101   health only; exactly 1 process, never clustered
                                 indexer 127.0.0.1:4102   health only
                                 worker  127.0.0.1:4103   health only
```

| File | What it does |
|---|---|
| `bootstrap.sh` | One-time server setup (safe to re-run): updates, firewall, fail2ban, Node 22, PM2, the `coinside` user, the environment file, Nginx and the Let's Encrypt certificate. |
| `coinside-deploy.sh` | Installed as `coinside-deploy`. Builds a release, switches to it with no downtime, and switches back by itself if it isn't healthy. Also `rollback`, `status` and `logs`. |
| `nginx/` | The coinside.fun site and its snippets (TLS, security headers, proxy, Cloudflare). |
| `system/` | systemd unit for PM2, fail2ban jail, log rotation, automatic security updates, optional SSH hardening. |

## Sharing the server with other apps

The server can host other sites; this one already serves uspad next to Coinside. The setup script only
adds to what's there:

- **Nginx.** Every name in Coinside's config starts with `coinside`, and it never claims the default server
  (the site Nginx uses for unknown host names, one per port). If no other site has that role, the script
  adds `000-coinside-catch-all`, which drops such requests. If Nginx rejects a Coinside site, the script
  disables it again before stopping, so the other sites keep working and Nginx can still restart.
- **Ports.** If another program already uses one of Coinside's ports (web 3000, api 4000, health checks
  4101 to 4103), the script moves Coinside to the next free port and writes it to the environment file
  (`WEB_PORT`, `API_PORT`, ...). `coinside-deploy` refuses to switch if a port is taken.
- **Firewall.** If the firewall is off and other programs serve public ports, the script leaves it off and
  lists those ports. If it's already on, it adds SSH, HTTP and HTTPS, and lists the public ports that no
  rule allows.
- **Node.js and PM2.** An existing Node 22 and an existing PM2 are used as they are. If a different Node
  version is installed system-wide, the script stops rather than replace it. Coinside's PM2 runs as the
  `coinside` user, separately from any PM2 that root or another user runs.
- **Time zone.** Left as it is.

### Removing the other apps

`remove-other-apps.sh` removes every app on the server except Coinside. By default it only shows what it would
remove. With `--yes` it stops the other apps, writes everything it removes (home folders, databases, Redis
data, configs, crontabs, certificates) to one root-only archive, `/root/removed-apps-backup-<time>.tar.gz`,
and only then deletes. The PostgreSQL and Redis servers stay, because Coinside uses them from P2. Anything a
package installed stays too. `--keep NAME` keeps a user, site, database or folder.

```bash
bash /srv/coinside/current/deploy/remove-other-apps.sh
```

Take a snapshot in hPanel (VPS → Snapshots & Backups), then:

```bash
bash /srv/coinside/current/deploy/remove-other-apps.sh --yes
```

```bash
bash /srv/coinside/current/deploy/bootstrap.sh
```

The last command makes Coinside the default site for unknown host names, now that no other site holds that
role. Delete the archive after a week or two once nothing is missed.

## On the server

| Path | What |
|---|---|
| `/srv/coinside/current` | Symlink to the live release |
| `/srv/coinside/releases/<UTC time>-<commit>` | One built release per deploy. The newest 5 good ones are kept for rollback. |
| `/srv/coinside/deploys.log` | Who deployed what and when, and how it ended |
| `/srv/coinside/repo.git` | Bare clone of the GitHub repository |
| `/etc/coinside/coinside.env` | Environment and secrets. Owned by root, readable by the `coinside` group only. Never leaves the server. |
| `/etc/coinside/keys/` | Keypairs, from P3 on (engine signer, root poster) |
| `/home/coinside/.pm2/logs/` | Process logs, rotated daily, kept 14 days |
| `/var/log/coinside-bootstrap.log` | Everything `bootstrap.sh` printed |

## First time (about 10 minutes)

### 1. DNS

At Hostinger (Domains → coinside.fun → DNS records):

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `@` | `31.97.66.123` | 300 |
| CNAME | `www` | `coinside.fun` | 300 |

Delete any other A or AAAA record for `@` or `www`; Hostinger sometimes adds parking records. Optional: an
AAAA record for `@` pointing to `2a02:4780:59:cdb2::1` lets IPv6 visitors connect directly. Nginx and the
firewall already handle IPv6.

### 2. Set up the server

Log in as root and run:

```bash
apt-get update && apt-get install -y git
```

```bash
git clone --branch claude/new-session-nptqr8 https://github.com/fourtisf/flipside.git /root/coinside-setup
```

```bash
bash /root/coinside-setup/deploy/bootstrap.sh
```

Each step prints what it did. If the script stops, it says why and what to fix: DNS not pointing at the
server yet, port 80 blocked, and so on. Fix that and run it again; finished steps are skipped.

### 3. Deploy

```bash
coinside-deploy
```

The first deploy takes 2 to 3 minutes: it downloads packages, runs the typecheck and unit tests, and builds.
Then open https://coinside.fun. You can delete `/root/coinside-setup`; later runs of the setup script use
`/srv/coinside/current/deploy/bootstrap.sh`.

### 4. Reboot if asked

If the setup installed a new kernel it says so at the end. Reboot; PM2 starts everything again:

```bash
reboot
```

```bash
coinside-deploy status
```

### 5. Recommended: key-only SSH logins

On your own computer, create a key if you don't have one (`ssh-keygen -t ed25519`), copy it to the server
with `ssh-copy-id root@31.97.66.123`, and log in once with it. Then, on the server:

```bash
bash /srv/coinside/current/deploy/bootstrap.sh --harden-ssh
```

Keep that session open and check that a new login works in a second terminal before you close it. If you
ever lock yourself out, Hostinger's browser terminal (hPanel → VPS → Browser terminal) still gets in.

## Every day

Run these as root or as the `coinside` user (`sudo -iu coinside`).

| Task | Command |
|---|---|
| Deploy GitHub's default branch | `coinside-deploy` |
| Deploy a branch, tag or commit | `coinside-deploy <ref>` |
| Go back one release | `coinside-deploy rollback` |
| See what's live and whether it's healthy | `coinside-deploy status` |
| Follow the logs | `coinside-deploy logs` or `coinside-deploy logs api` |
| Deploy without the typecheck and tests (urgent fixes only) | `coinside-deploy --skip-checks` |

How a deploy works: the release is installed, checked and built in its own directory while the live one
keeps serving. Then `current` moves to it and PM2 reloads web and api one worker at a time. The other
processes restart in under a second. The deploy only counts if every process comes up on the new release,
answers its health check, and doesn't restart for 10 seconds. Otherwise `current` moves back and the
previous release is reloaded. In rehearsal, deploys and rollbacks under steady traffic dropped no requests.

### Change the environment

```bash
nano /etc/coinside/coinside.env
```

```bash
coinside-deploy
```

A deploy rebuilds, so changes to values baked into the web build (`APP_URL`) are picked up too.

### Change server config (Nginx, the PM2 unit, the deploy script)

Change the file in `deploy/`, merge it, and deploy. The deploy warns when a release changes a file that the
setup script installs; apply it with:

```bash
bash /srv/coinside/current/deploy/bootstrap.sh
```

### Change worker counts

PM2 keeps a process's mode and worker count across reloads. To change a count now, and for future starts:

```bash
sudo -iu coinside pm2 scale web 3
```

Also set `WEB_INSTANCES=3` (or `API_INSTANCES`) in the environment file. To switch a process between fork
and cluster mode, run `sudo -iu coinside pm2 delete <name>` and deploy; that process is down for the length
of the deploy.

## Security in place

- Firewall: only SSH (rate limited), 80 and 443 are open. The processes listen on 127.0.0.1 only.
- fail2ban bans an address for an hour after 5 failed SSH logins in 10 minutes.
- Security updates install daily. The server never reboots by itself; `coinside-deploy status` says when a
  reboot is pending.
- TLS 1.2 and 1.3 only, HSTS for a year, HTTP to HTTPS, www to the bare domain. Requests for any other host
  name, or the bare IP address, are dropped.
- Headers: no framing (`X-Frame-Options: DENY`, `frame-ancestors 'none'`), so the trade buttons can't be
  clickjacked; `nosniff`, `Referrer-Policy` and `Permissions-Policy`.
- Nginx limits `/api` to 60 requests per second per IP (bursts of 120).
- Secrets live only in `/etc/coinside`. The setup script generates them on the server; `.gitignore` blocks
  env files and keypairs from the repository.
- The app runs as the unprivileged `coinside` user, with no sudo.

## Not done yet, by phase

- **P0 preview.** `X-Robots-Tag: noindex` keeps the prototype out of search results. Remove it from
  `nginx/snippets/coinside-headers.conf` at launch. The site footer already says the data is simulated.
- **P1.** Put the Helius key and mainnet RPC URL in the environment file.
- **P2.** Postgres and Redis on the server; daily encrypted backups off the server, with point-in-time
  recovery; Telegram alerts; an outside uptime monitor on `https://coinside.fun/api/health`.
- **P3.** Keypairs go in `/etc/coinside/keys`. The engine and worker get their own Unix users so only they
  can read their keys (CLAUDE.md section 13). A script Content-Security-Policy with nonces arrives with the
  wallet adapter.
- **Before launch.** Cloudflare in front (below).

## Moving DNS to Cloudflare

1. Add coinside.fun in Cloudflare, check that it imported the A and CNAME records, turn the proxy on, and
   switch the nameservers at Hostinger to Cloudflare's.
2. SSL/TLS mode: Full (strict). Network: WebSockets on.
3. In `nginx/coinside.fun.conf`, uncomment `include snippets/coinside-cloudflare.conf;`. Logs and the rate
   limit then see the visitor's address instead of Cloudflare's. Merge, deploy, and re-run the setup script.

Certificate renewal keeps working through the proxy: Let's Encrypt's challenge path is served on both
ports 80 and 443.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Setup says Nginx rejected a site | The message includes Nginx's own error. The Coinside site was disabled again, so the other sites are unaffected. |
| Setup says a name "resolves to …, which is not this server" | The DNS record, or it hasn't spread yet. `getent hosts coinside.fun www.coinside.fun` shows what the server sees. |
| certbot times out | Port 80 blocked outside the server: hPanel → VPS → Firewall. `ufw status` for the server's own firewall. |
| certbot mentions CAA | A CAA record at Hostinger must allow `letsencrypt.org`, or there must be no CAA records. |
| 502 Bad Gateway | `coinside-deploy status`, then `coinside-deploy logs`. |
| A deploy says the build failed | Its output names the failing step. The live site was not touched. |
| Disk filling up | `df -h /`, `du -sh /srv/coinside/releases/*`, and `sudo -iu coinside pnpm store prune`. |
