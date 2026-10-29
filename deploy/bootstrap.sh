#!/usr/bin/env bash
# Prepare an Ubuntu 22.04 or 24.04 server to run Coinside at coinside.fun. Safe to re-run: every step
# checks before it changes anything, and existing secrets are never overwritten or printed.
#
#   sudo bash deploy/bootstrap.sh [--email you@example.com] [--harden-ssh] [--skip-dns-check]
#
# Installs updates and daily security updates, swap if there is none, the firewall (SSH, HTTP and HTTPS)
# and fail2ban, Node 22 with corepack and PM2, the `coinside` user, /srv/coinside and
# /etc/coinside/coinside.env, a clone of the repository, Nginx with a Let's Encrypt certificate for
# coinside.fun and www.coinside.fun, PM2 at boot, log rotation, and the coinside-deploy command. Output is
# also written to /var/log/coinside-bootstrap.log.
#
# On a server that already hosts other apps it only adds to them. It never takes another site's default
# server or another program's ports, never turns the firewall on over ports other programs serve, and
# never replaces a different Node.js or an existing PM2.
#
#   --email ADDRESS   contact address for the Let's Encrypt account (optional; renewal is automatic)
#   --harden-ssh      allow SSH logins with a key only (needs a key in /root/.ssh/authorized_keys)
#   --skip-dns-check  don't require coinside.fun to point at this server (for example behind Cloudflare)
#   --repo URL        repository to deploy from (default https://github.com/fourtisf/flipside.git)
set -Eeuo pipefail

DOMAIN=coinside.fun
APP_USER=coinside
APP_HOME=/srv/coinside
ENV_DIR=/etc/coinside
ENV_FILE=$ENV_DIR/coinside.env
WEBROOT=/var/www/certbot
NODE_MAJOR=22
PM2_VERSION=7.0.4
REPO_URL=https://github.com/fourtisf/flipside.git
EMAIL=
HARDEN_SSH=0
CHECK_DNS=1
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$HERE/.." && pwd)
SELF=$HERE/$(basename "${BASH_SOURCE[0]}")
cd / # the coinside user must be able to stat the working directory
# GitHub's published SSH host key (SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU), pinned so a
# private-repository clone over SSH never trusts a key on first sight.
GITHUB_HOST_KEY='github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl'
# Every port Coinside listens on (all on 127.0.0.1), with its default.
PORT_KEYS=(WEB_PORT:3000 API_PORT:4000 ENGINE_HEALTH_PORT:4101 INDEXER_HEALTH_PORT:4102 WORKER_HEALTH_PORT:4103)

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[31merror:\033[0m %s\n' "$*" >&2
  exit 1
}
# Report the failing line once. Inside $(...) and pipelines the caller handles the result, so stay quiet.
# shellcheck disable=SC2317  # called by the ERR trap
on_error() {
  local status=$?
  ((BASH_SUBSHELL == 0)) || exit "$status"
  die "line $1 failed: $2"
}
trap 'on_error $LINENO "$BASH_COMMAND"' ERR

# Install an Nginx config, leaving out the IPv6 listeners on a server without IPv6 (Nginx won't start).
install_nginx_conf() {
  if [[ -e /proc/net/if_inet6 ]]; then
    install -m 0644 "$1" "$2"
  else
    grep -v 'listen \[::\]' "$1" | install -m 0644 /dev/stdin "$2"
  fi
}

# Install and enable an Nginx site. If Nginx rejects the result, disable the site again, so the sites
# already running are unaffected and Nginx can still restart, then stop.
enable_site() {
  local name=$1 src=$2 out
  install_nginx_conf "$src" "/etc/nginx/sites-available/$name"
  ln -sfn "../sites-available/$name" "/etc/nginx/sites-enabled/$name"
  if ! out=$(nginx -t 2>&1); then
    rm -f "/etc/nginx/sites-enabled/$name"
    die "Nginx rejected the $name site, so it was disabled again and the other sites are unaffected. Nginx said: $out"
  fi
}

# True if a program other than the coinside user's listens on TCP port $1, on any address.
port_taken() {
  local lines pids pid
  lines=$(ss -ltnpH "sport = :$1") || true
  [[ -n $lines ]] || return 1
  pids=$(grep -oE 'pid=[0-9]+' <<<"$lines" | cut -d= -f2 | sort -u) || true
  [[ -n $pids ]] || return 0
  for pid in $pids; do
    [[ $(ps -o user= -p "$pid" 2>/dev/null | tr -d ' ') == "$APP_USER" ]] || return 0
  done
  return 1
}

env_get() {
  awk -v k="$1" 'index($0, k "=") == 1 { v = substr($0, length(k) + 2); sub(/[ \t]+#.*$/, "", v); print v; exit }' "$ENV_FILE"
}

env_set() {
  if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >>"$ENV_FILE"; fi
  chown root:"$APP_USER" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
}

while (($#)); do
  case $1 in
    --email) EMAIL=${2:?--email needs an address}; shift 2 ;;
    --harden-ssh) HARDEN_SSH=1; shift ;;
    --skip-dns-check) CHECK_DNS=0; shift ;;
    --repo) REPO_URL=${2:?--repo needs a URL}; shift 2 ;;
    -h | --help) awk 'NR > 1 { if (!/^#/) exit; if (/^# shellcheck/) next; sub(/^# ?/, ""); print }' "$SELF"; exit 0 ;;
    *) die "unknown option $1 (see --help)" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "run this as root: sudo bash $SELF"
# shellcheck source=/dev/null
. /etc/os-release
[[ $ID == ubuntu && ($VERSION_ID == 22.04 || $VERSION_ID == 24.04) ]] ||
  die "this script supports Ubuntu 22.04 and 24.04; this server runs $PRETTY_NAME"
[[ -f $REPO_ROOT/.env.example && -f $HERE/nginx/coinside.fun.conf ]] ||
  die "run this from a checkout of the repository (deploy/bootstrap.sh inside it)"

exec > >(tee -a /var/log/coinside-bootstrap.log) 2>&1
printf '\n----- %s bootstrap from %s -----\n' "$(date -u +%FT%TZ)" "$REPO_ROOT"

export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
APT=(apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

# ---------------------------------------------------------------------------------------------------
step "Root shell profile"
fixed=0
for f in /root/.bashrc /root/.profile /root/.bash_profile; do
  if [[ -f $f && ! -e /root/.cargo/env ]] && grep -q '\.cargo/env' "$f"; then
    sed -i.coinside-bak '/\.cargo\/env/d' "$f"
    note "removed the line that sources the missing ~/.cargo/env from $f (backup: $f.coinside-bak)"
    fixed=1
  fi
done
((fixed)) || note "nothing to fix"

# ---------------------------------------------------------------------------------------------------
step "System updates"
apt-get update -q
"${APT[@]}" full-upgrade
"${APT[@]}" install ca-certificates curl gnupg git openssl nginx certbot ufw fail2ban python3-systemd \
  unattended-upgrades ssl-cert logrotate sudo iproute2
install -m 0644 "$HERE/system/20auto-upgrades" /etc/apt/apt.conf.d/20auto-upgrades
note "daily security updates are on; the server never reboots by itself"

step "Clock"
timedatectl set-ntp true || warn "could not turn on time sync; check: timedatectl"
note "time zone $(timedatectl show -p Timezone --value) (left as it is), NTP $(timedatectl show -p NTP --value)"

step "Swap"
if swapon --show --noheadings | grep -q .; then
  note "already has swap: $(swapon --show --noheadings | awk '{print $1, $3}' | paste -sd ' ')"
else
  [[ -f /swapfile ]] || { fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null; }
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  echo 'vm.swappiness=10' >/etc/sysctl.d/60-coinside-swap.conf
  sysctl -q -p /etc/sysctl.d/60-coinside-swap.conf
  note "added a 2 GB swap file (only used if memory runs out, for example during a build)"
fi

# ---------------------------------------------------------------------------------------------------
step "Firewall"
# Every port sshd listens on, plus the one this session came in on, so the firewall can't lock you out.
ports=$(sshd -T 2>/dev/null | awk '$1 == "port" { print $2 }') || true
if [[ -n ${SSH_CONNECTION:-} ]]; then ports+=$'\n'$(awk '{ print $4 }' <<<"$SSH_CONNECTION"); fi
mapfile -t ssh_ports < <(awk '/^[0-9]+$/' <<<"$ports" | sort -un)
((${#ssh_ports[@]})) || ssh_ports=(22)
for p in "${ssh_ports[@]}"; do ufw limit "$p/tcp" comment 'SSH' >/dev/null; done
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
# Ports that programs serve on public addresses and no firewall rule allows.
mapfile -t exposed < <(comm -23 \
  <(ss -ltnH | awk '{ print $4 }' | awk '!/^(127\.|\[::1\]|\[::ffff:127\.)/' | sed -E 's/.*:([0-9]+)$/\1/' | sort -u) \
  <(ufw show added | grep -oE '\b[0-9]{1,5}\b' | sort -u))
if ufw status | grep -q '^Status: active'; then
  note "the firewall is on; SSH (port ${ssh_ports[*]}, rate limited), 80 and 443 are allowed"
  ((${#exposed[@]} == 0)) ||
    warn "ports ${exposed[*]} listen on public addresses but no firewall rule allows them, so they can't be reached from outside. If another app needs one, run: ufw allow PORT/tcp"
elif ((${#exposed[@]})); then
  warn "left the firewall off: other programs serve ports ${exposed[*]} on public addresses, and turning it on would cut them off. Allow the ones that must stay reachable (ufw allow PORT/tcp), then run this script again."
else
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw --force enable >/dev/null
  note "on: SSH (port ${ssh_ports[*]}, rate limited), 80 and 443 are open, everything else is closed"
fi
note "Coinside's processes listen on 127.0.0.1 only; Nginx is the only way in."

step "fail2ban"
install -m 0644 "$HERE/system/fail2ban-coinside.local" /etc/fail2ban/jail.d/coinside.local
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban
note "SSH: 5 failed logins in 10 minutes bans the address for an hour"

if ((HARDEN_SSH)); then
  step "SSH: key-only logins"
  [[ -s /root/.ssh/authorized_keys ]] ||
    die "--harden-ssh needs your public key in /root/.ssh/authorized_keys first; nothing was changed"
  install -m 0644 "$HERE/system/sshd-coinside.conf" /etc/ssh/sshd_config.d/01-coinside.conf
  if ! sshd -t; then
    rm -f /etc/ssh/sshd_config.d/01-coinside.conf
    die "the SSH config test failed, so the change was undone"
  fi
  systemctl reload ssh 2>/dev/null || systemctl restart ssh
  note "passwords are off. Keep this session open and test a new login in another terminal now."
fi

# ---------------------------------------------------------------------------------------------------
step "Node.js $NODE_MAJOR, corepack and PM2"
if command -v node >/dev/null; then
  have=$(node --version)
  [[ $have == "v$NODE_MAJOR."* ]] ||
    die "this server already has Node.js $have at $(command -v node), and other apps may depend on it. Coinside needs Node $NODE_MAJOR; nothing was changed. Tell the Coinside developers which apps use Node here."
  note "using the installed Node.js $have"
else
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
    gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" \
    >/etc/apt/sources.list.d/nodesource.list
  printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 600\n' >/etc/apt/preferences.d/nodejs
  apt-get update -q
  "${APT[@]}" install nodejs
  note "installed Node.js $(node --version)"
fi
command -v pnpm >/dev/null || corepack enable
# An existing PM2 is left alone (other apps may run on it). Never run `pm2 --version` here: it would
# start a PM2 daemon for root.
if command -v pm2 >/dev/null; then
  note "using the installed PM2 at $(command -v pm2)"
else
  npm install -g --no-fund --no-audit --loglevel=error "pm2@$PM2_VERSION"
  note "installed PM2 $PM2_VERSION"
fi

# ---------------------------------------------------------------------------------------------------
step "User, directories and environment file"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/home/$APP_USER" --shell /bin/bash "$APP_USER"
  note "created the $APP_USER user (no password, no sudo)"
fi
install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$APP_HOME" "$APP_HOME/releases"
install -d -o root -g "$APP_USER" -m 0750 "$ENV_DIR" "$ENV_DIR/keys"
install -d -m 0755 "$WEBROOT/.well-known/acme-challenge"

if [[ -f $ENV_FILE ]]; then
  note "$ENV_FILE already exists; left as it is"
else
  {
    echo "# Coinside server environment. Generated by deploy/bootstrap.sh on $(date -u +%F)."
    echo "# Lives only on this server. Never copy it into the repository or paste it anywhere."
    echo
    sed -e "s|^NODE_ENV=.*|NODE_ENV=production|" \
      -e "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" \
      -e "s|^API_URL=.*|API_URL=https://$DOMAIN|" \
      -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" \
      -e "s|^COOKIE_SECRET=.*|COOKIE_SECRET=$(openssl rand -hex 32)|" \
      -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://coinside:$(openssl rand -hex 16)@localhost:5432/coinside|" \
      "$REPO_ROOT/.env.example"
  } | install -o root -g "$APP_USER" -m 0640 /dev/stdin "$ENV_FILE"
  note "wrote $ENV_FILE (readable by root and $APP_USER only) with fresh random secrets"
fi

step "Ports"
declare -A PORT=()
for spec in "${PORT_KEYS[@]}"; do
  key=${spec%%:*}
  port=$(env_get "$key")
  port=${port:-${spec#*:}}
  [[ $port =~ ^[0-9]+$ ]] || die "$key in $ENV_FILE is not a port number: $port"
  start=$port
  while port_taken "$port" || [[ " ${PORT[*]:-} " == *" $port "* ]]; do port=$((port + 1)); done
  [[ $port == "$start" ]] || note "port $start is used by another program, so $key moves to $port"
  [[ $(env_get "$key") == "$port" ]] || env_set "$key" "$port"
  PORT[$key]=$port
done
note "web ${PORT[WEB_PORT]}, api ${PORT[API_PORT]}, health checks ${PORT[ENGINE_HEALTH_PORT]}, ${PORT[INDEXER_HEALTH_PORT]}, ${PORT[WORKER_HEALTH_PORT]} (all on 127.0.0.1)"

step "Repository"
as_app() { sudo -u "$APP_USER" -H "$@"; }
as_app install -d -m 0700 "/home/$APP_USER/.ssh"
if [[ ! -f /home/$APP_USER/.ssh/id_ed25519 ]]; then
  as_app ssh-keygen -q -t ed25519 -N '' -C "coinside-deploy@$(hostname)" -f "/home/$APP_USER/.ssh/id_ed25519"
fi
grep -qxF "$GITHUB_HOST_KEY" "/home/$APP_USER/.ssh/known_hosts" 2>/dev/null ||
  echo "$GITHUB_HOST_KEY" | as_app tee -a "/home/$APP_USER/.ssh/known_hosts" >/dev/null
if [[ ! -d $APP_HOME/repo.git ]]; then
  as_app git clone --quiet --bare "$REPO_URL" "$APP_HOME/repo.git"
fi
as_app git -C "$APP_HOME/repo.git" remote set-url origin "$REPO_URL"
as_app git -C "$APP_HOME/repo.git" config remote.origin.fetch '+refs/heads/*:refs/heads/*'
as_app git -C "$APP_HOME/repo.git" fetch --quiet --prune --tags origin
note "$APP_HOME/repo.git tracks $REPO_URL"

# ---------------------------------------------------------------------------------------------------
step "PM2 at boot and log rotation"
install -m 0644 "$HERE/system/pm2-coinside.service" /etc/systemd/system/pm2-coinside.service
install -m 0644 "$HERE/system/logrotate-coinside" /etc/logrotate.d/coinside
systemctl daemon-reload
systemctl enable pm2-coinside >/dev/null 2>&1
systemctl is-active --quiet pm2-coinside || systemctl start pm2-coinside
install -m 0755 "$HERE/coinside-deploy.sh" /usr/local/bin/coinside-deploy
note "pm2-coinside.service is $(systemctl is-active pm2-coinside); coinside-deploy is installed"

# ---------------------------------------------------------------------------------------------------
step "Nginx and HTTPS"
if busy=$(ss -ltnpH '( sport = :80 or sport = :443 )' | grep -v '"nginx"'); then
  die "something other than Nginx is listening on port 80 or 443; stop and disable it first: $busy"
fi
install -m 0644 "$HERE"/nginx/snippets/*.conf /etc/nginx/snippets/
sed -e "s/127\.0\.0\.1:3000;/127.0.0.1:${PORT[WEB_PORT]};/" -e "s/127\.0\.0\.1:4000;/127.0.0.1:${PORT[API_PORT]};/" \
  "$HERE/nginx/snippets/coinside-upstreams.conf" | install -m 0644 /dev/stdin /etc/nginx/snippets/coinside-upstreams.conf
# Ubuntu's own welcome page goes, but only if nobody has changed it.
stock=$(dpkg-query -W -f='${Conffiles}\n' nginx-common 2>/dev/null | awk '$1 == "/etc/nginx/sites-available/default" { print $2 }') || true
if [[ -L /etc/nginx/sites-enabled/default && -n $stock ]] &&
  [[ $(md5sum </etc/nginx/sites-available/default | cut -d' ' -f1) == "$stock" ]]; then
  rm -f /etc/nginx/sites-enabled/default
  note "disabled Ubuntu's default welcome page"
fi
mapfile -t others < <(find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -printf '%f\n' |
  grep -vE "^($DOMAIN|coinside-acme|000-coinside-catch-all)$" | sort || true)
((${#others[@]} == 0)) || note "this Nginx also serves: ${others[*]} (left untouched)"
cert=/etc/letsencrypt/live/$DOMAIN/fullchain.pem

if [[ ! -f $cert ]]; then
  if ((CHECK_DNS)); then
    mapfile -t mine < <(ip -o addr show scope global | awk '{ split($4, a, "/"); print a[1] }')
    for host in "$DOMAIN" "www.$DOMAIN"; do
      mapfile -t got < <({ getent ahosts "$host" || true; } | awk '{ print $1 }' | sort -u)
      ((${#got[@]})) || die "$host does not resolve yet. Add the DNS records from deploy/README.md, wait a few minutes and run this again."
      for ip in "${got[@]}"; do
        printf '%s\n' "${mine[@]}" | grep -qxF "$ip" ||
          die "$host resolves to $ip, which is not this server (${mine[*]}). Fix that DNS record (an AAAA record counts too) and run this again, or pass --skip-dns-check if a proxy such as Cloudflare is in front."
      done
    done
    note "$DOMAIN and www.$DOMAIN point at this server"
  fi

  # A plain HTTP site, just long enough to answer the first Let's Encrypt challenge.
  rm -f "/etc/nginx/sites-enabled/$DOMAIN"
  enable_site coinside-acme /dev/stdin <<CONF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root $WEBROOT; default_type text/plain; }
    location / { return 503; }
}
CONF
  systemctl reload-or-restart nginx

  probe=coinside-probe-$RANDOM$RANDOM
  echo ok >"$WEBROOT/.well-known/acme-challenge/$probe"
  for _ in 1 2 3 4 5; do # a reload takes a moment to reach the workers
    answer=$(curl -fsS --max-time 5 "http://$DOMAIN/.well-known/acme-challenge/$probe" 2>/dev/null) || true
    [[ $answer == ok ]] && break
    sleep 1
  done
  [[ $answer == ok ]] ||
    warn "could not fetch http://$DOMAIN/.well-known/acme-challenge/ from this server; if the next step fails, check that port 80 is open in Hostinger's VPS firewall (hPanel)"
  rm -f "$WEBROOT/.well-known/acme-challenge/$probe"

  if [[ -n $EMAIL ]]; then email_args=(--email "$EMAIL" --no-eff-email); else email_args=(--register-unsafely-without-email); fi
  certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" -d "www.$DOMAIN" --key-type ecdsa \
    --agree-tos --non-interactive "${email_args[@]}"
fi
rm -f /etc/nginx/sites-enabled/coinside-acme /etc/nginx/sites-available/coinside-acme

install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\n# Installed by deploy/bootstrap.sh: load renewed certificates.\nsystemctl reload nginx\n' \
  >/etc/letsencrypt/renewal-hooks/deploy/coinside-reload-nginx
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/coinside-reload-nginx
systemctl enable --now certbot.timer >/dev/null 2>&1 || warn "certbot.timer is not enabled; check: systemctl list-timers"

# Nginx allows one default server per port. Take that role only if no other site has it.
rm -f /etc/nginx/sites-enabled/000-coinside-catch-all
mapfile -t defaults < <(grep -lE '^[^#]*\blisten\b[^;]*\bdefault_server\b' /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null |
  grep -vE "/$DOMAIN\$" || true)
if ((${#defaults[@]} == 0)); then
  enable_site 000-coinside-catch-all "$HERE/nginx/catch-all.conf"
  note "requests for other host names, or for the bare IP address, are dropped"
else
  note "$(basename -a "${defaults[@]}" | paste -sd ' ') is the default server for unknown host names; left as it is"
fi

enable_site "$DOMAIN" "$HERE/nginx/coinside.fun.conf"
systemctl reload-or-restart nginx
note "certificate valid until $(openssl x509 -enddate -noout -in "$cert" | cut -d= -f2); renews automatically"

# ---------------------------------------------------------------------------------------------------
step "Done"
note "Next, build and start the app (as root is fine; it switches to the $APP_USER user):"
note "  coinside-deploy"
note "Then open https://$DOMAIN"
if [[ $REPO_URL == git@* ]]; then
  note "The repository is cloned over SSH. This server's deploy key (add it to GitHub, read-only):"
  note "  $(cat "/home/$APP_USER/.ssh/id_ed25519.pub")"
fi
[[ -f /var/run/reboot-required ]] &&
  warn "updates need a reboot. After the first deploy, run: reboot   (PM2 starts everything again on boot)"
exit 0
