#!/usr/bin/env bash
# Remove every app on this server except Coinside. Run as root.
#
#   sudo bash deploy/remove-other-apps.sh                 show what would be removed (changes nothing)
#   sudo bash deploy/remove-other-apps.sh --yes           back up everything listed, then remove it
#   sudo bash deploy/remove-other-apps.sh --keep NAME     also keep a user, site, database or folder
#
# Before removing anything, --yes stops the other apps and writes one archive with all of it (home folders,
# databases, Redis data, configs, crontabs, certificates) to /root/removed-apps-backup-<UTC time>.tar.gz, so
# a mistake can be undone. Take a VPS snapshot in hPanel first anyway.
#
# Kept: the coinside user, /srv/coinside, /etc/coinside, the coinside.fun site and certificate, the
# PostgreSQL and Redis servers (Coinside uses them from P2 with its own database), SSH, the firewall, system
# packages and Ubuntu's own files. Anything a package installed is never touched.
set -Eeuo pipefail

APP_USER=coinside
DOMAIN=coinside.fun
YES=0
KEEP=()
STAMP=$(date -u +%Y%m%d-%H%M%S)
WORK=/root/removed-apps-backup-$STAMP
ARCHIVE=$WORK.tar.gz
SELF=$(readlink -f "${BASH_SOURCE[0]}")

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[31merror:\033[0m %s\n' "$*" >&2
  exit 1
}
# shellcheck disable=SC2317  # called by the ERR trap
on_error() {
  local status=$?
  ((BASH_SUBSHELL == 0)) || exit "$status"
  die "line $1 failed: $2"
}
trap 'on_error $LINENO "$BASH_COMMAND"' ERR

while (($#)); do
  case $1 in
    --yes) YES=1; shift ;;
    --keep) KEEP+=("${2:?--keep needs a name}"); shift 2 ;;
    -h | --help) awk 'NR > 1 { if (!/^#/) exit; if (/^# shellcheck/) next; sub(/^# ?/, ""); print }' "$SELF"; exit 0 ;;
    *) die "unknown option $1 (see --help)" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "run this as root: sudo bash $SELF"
umask 077 # the backup holds database dumps and app secrets: root only, from the first byte
[[ -L /srv/coinside/current ]] || die "Coinside is not deployed on this server (/srv/coinside/current is missing), so nothing is removed"
cd /

kept() {
  local k
  for k in "$APP_USER" "${KEEP[@]}"; do [[ $1 == "$k" ]] && return 0; done
  return 1
}
packaged() { dpkg -S "$1" >/dev/null 2>&1; }
psql_q() { sudo -u postgres psql -X -At -v ON_ERROR_STOP=1 "$@"; }
in_list() {
  local x=$1
  shift
  local y
  for y in "$@"; do [[ $x == "$y" ]] && return 0; done
  return 1
}

# Only these places are ever deleted from, and never these exact paths.
safe_rm() {
  local p=$1
  case $p in
    / | /root | /root/.ssh | /home | /home/"$APP_USER" | /srv | /srv/coinside | /etc | /etc/coinside | /opt | /var | /var/www | /var/www/certbot | /var/www/html)
      warn "refusing to remove $p"
      return 0
      ;;
    /home/?* | /root/?* | /srv/?* | /var/www/?* | /var/backups/?* | /opt/?* | /etc/?* | /var/log/?* | /var/lib/?* | /var/cache/?* | /var/mail/?*)
      rm -rf -- "$p"
      ;;
    *) warn "refusing to remove $p (outside the folders this script cleans)" ;;
  esac
}

# ------------------------------------------------------------------------------------------------- plan
# Accounts of apps and people: a home folder in /home (whatever the shell), or an ordinary user ID
# (1000-59999) with a real login shell. Service accounts (nologin, or IDs outside that range, like snap's
# or a build system's) are never touched.
USERS=()
while IFS=: read -r name _ uid _ _ home shell; do
  if [[ $home == /home/* ]] || { ((uid >= 1000 && uid <= 59999)) && [[ ! $shell =~ (nologin|false|sync)$ ]]; }; then
    kept "$name" || [[ $name == "${SUDO_USER:-}" ]] || USERS+=("$name")
  fi
done </etc/passwd

# App names: the users, and the part before a dash (divvy-web -> divvy). Used for leftover folders.
NAMES=()
for u in "${USERS[@]}"; do
  in_list "$u" "${NAMES[@]}" || NAMES+=("$u")
  in_list "${u%%-*}" "${NAMES[@]}" || NAMES+=("${u%%-*}")
done

PATHS=() # folders and files to remove, all inside safe_rm's list
add_path() { [[ -e $1 || -L $1 ]] && ! in_list "$1" "${PATHS[@]}" && PATHS+=("$1"); return 0; }
for p in /home/* /srv/* /var/www/*; do
  n=$(basename "$p")
  case $p in /var/www/html | /var/www/certbot) continue ;; esac
  kept "$n" || add_path "$p"
done
for p in /root/*; do
  n=$(basename "$p")
  [[ $n == removed-apps-backup-* ]] || kept "$n" || add_path "$p"
done
[[ -d /root/.pm2 ]] && add_path /root/.pm2
for p in /var/backups/*; do
  n=$(basename "$p")
  # Ubuntu's own daily backups of the package lists and account files stay.
  [[ $n =~ ^(apt\.extended_states|dpkg\.|alternatives\.tar|passwd\.bak|group\.bak|shadow\.bak|gshadow\.bak) ]] && continue
  kept "$n" || add_path "$p"
done
for p in /opt/*; do
  n=$(basename "$p")
  packaged "$p" || kept "$n" || add_path "$p"
done
for u in "${USERS[@]}"; do add_path "/var/mail/$u"; done
for n in "${NAMES[@]}"; do
  for d in /etc /var/log /var/lib /var/cache; do
    [[ -e $d/$n ]] && ! packaged "$d/$n" && add_path "$d/$n"
  done
done

UNITS=() # systemd units of the other apps (regular files only: symlinks there are enabled packages)
for f in /etc/systemd/system/*.service /etc/systemd/system/*.timer; do
  [[ -f $f && ! -L $f ]] || continue
  n=$(basename "$f")
  [[ $n == "pm2-$APP_USER.service" ]] && continue
  hit=0
  [[ $n == pm2-root.service ]] && hit=1
  for u in "${USERS[@]}"; do
    [[ $n == "pm2-$u.service" ]] && hit=1
    grep -qE "^(User|Group)=${u}[[:space:]]*$" "$f" && hit=1
  done
  for p in "${PATHS[@]}"; do grep -qF "$p/" "$f" && hit=1; done
  ((hit)) && UNITS+=("$n")
done

NGINX=() # other sites, and conf.d files no package installed
for f in /etc/nginx/sites-enabled/* /etc/nginx/sites-available/*; do
  [[ -e $f || -L $f ]] || continue
  n=$(basename "$f")
  case $n in "$DOMAIN" | 000-coinside-catch-all | coinside-acme | default) continue ;; esac
  kept "$n" || NGINX+=("$f")
done
for f in /etc/nginx/conf.d/*; do
  [[ -f $f ]] && ! packaged "$f" && ! kept "$(basename "$f")" && NGINX+=("$f")
done

CERTS=()
if command -v certbot >/dev/null; then
  while read -r c; do kept "$c" || CERTS+=("$c"); done < <(certbot certificates 2>/dev/null | awk '/Certificate Name:/ { print $3 }' | grep -vxF "$DOMAIN" || true)
fi

CRON=() # cron files no package installed (certbot, sysstat, e2scrub and the like stay)
for f in /etc/cron.d/* /etc/cron.hourly/* /etc/cron.daily/* /etc/cron.weekly/* /etc/cron.monthly/*; do
  [[ -f $f ]] && ! packaged "$f" && ! kept "$(basename "$f")" && CRON+=("$f")
done
ROOT_CRONTAB=0
if command -v crontab >/dev/null; then
  ROOT_CRONTAB=$(crontab -l 2>/dev/null | grep -cvE '^[[:space:]]*(#|$)' || true)
fi

DBS=()
ROLES=()
PG=0
if command -v psql >/dev/null && psql_q -c 'select 1' >/dev/null 2>&1; then
  PG=1
  while read -r d; do [[ -n $d ]] && ! kept "$d" && DBS+=("$d"); done < <(psql_q -c "select datname from pg_database where not datistemplate and datname not in ('postgres', '$APP_USER') order by 1")
  while read -r r; do [[ -n $r ]] && ! kept "$r" && ROLES+=("$r"); done < <(psql_q -c "select rolname from pg_roles where rolname !~ '^pg_' and rolname not in ('postgres', '$APP_USER') order by 1")
fi

REDIS=none
REDIS_KEYS=0
if command -v redis-cli >/dev/null; then
  ping=$(redis-cli ping 2>&1 || true)
  if [[ $ping == PONG ]]; then
    REDIS=open
    REDIS_KEYS=$(redis-cli info keyspace | awk -F'[=,:]' '/^db/ { n += $3 } END { print n + 0 }')
  elif [[ $ping == *NOAUTH* ]]; then
    REDIS=password
  fi
fi

ROOT_PM2=0
[[ -s /root/.pm2/pm2.pid ]] && kill -0 "$(cat /root/.pm2/pm2.pid)" 2>/dev/null && ROOT_PM2=1

# ------------------------------------------------------------------------------------------------- show
step "Will be removed"
size() { du -sh "$1" 2>/dev/null | cut -f1; }
note "Linux users (and their processes, crontabs and home folders): ${USERS[*]:-none}"
note "Root's PM2 and the apps it runs: $( ((ROOT_PM2)) && echo running || echo 'not running')"
note "Services: ${UNITS[*]:-none}"
note "Nginx: $( ((${#NGINX[@]})) && printf '%s ' "${NGINX[@]}" || echo none)"
note "HTTPS certificates: ${CERTS[*]:-none}"
note "Cron files: $( ((${#CRON[@]})) && printf '%s ' "${CRON[@]}" || echo none)"
note "Root's crontab: $ROOT_CRONTAB job(s)"
if ((PG)); then
  note "PostgreSQL databases: ${DBS[*]:-none}"
  for d in "${DBS[@]}"; do note "  $d: $(printf "select pg_size_pretty(pg_database_size(:'n'));\n" | psql_q -v n="$d")"; done
  note "PostgreSQL users: ${ROLES[*]:-none}"
else
  note "PostgreSQL: not running here, nothing to remove"
fi
case $REDIS in
  open) note "Redis data: $REDIS_KEYS key(s), all removed" ;;
  password) note "Redis: has a password set by another app, so its data is left as it is" ;;
  *) note "Redis: not running here" ;;
esac
note "Files and folders:"
for p in "${PATHS[@]}"; do note "  $(printf '%-7s' "$(size "$p")") $p"; done
((${#PATHS[@]})) || note "  none"

step "Kept"
note "coinside user, /srv/coinside, /etc/coinside, the $DOMAIN site and certificate, pm2-$APP_USER"
note "PostgreSQL and Redis servers, SSH, the firewall, packages and Ubuntu's own files"
mapfile -t hidden < <(find /root -mindepth 1 -maxdepth 1 -name '.*' ! -name .pm2 -printf '%f\n' | sort)
note "root's hidden files: ${hidden[*]:-none}"
((${#KEEP[@]} == 0)) || note "kept on request: ${KEEP[*]}"

if ((YES == 0)); then
  step "Nothing was changed"
  note "Check the list above. To keep something, add --keep NAME. Then take a snapshot in hPanel"
  note "(VPS > Snapshots & Backups) and run:  bash $SELF --yes"
  exit 0
fi

# ------------------------------------------------------------------------------------------------- stop
step "Stopping the other apps"
for u in "${UNITS[@]}"; do systemctl disable --now "$u" >/dev/null 2>&1 || true; done
if ((ROOT_PM2)); then PM2_HOME=/root/.pm2 pm2 kill >/dev/null 2>&1 || true; fi
for u in "${USERS[@]}"; do pkill -KILL -u "$u" 2>/dev/null || true; done
sleep 1
note "stopped"

# ------------------------------------------------------------------------------------------------- backup
step "Backing up to $ARCHIVE"
need=0
((${#PATHS[@]} == 0)) || need=$(du -sck "${PATHS[@]}" 2>/dev/null | tail -n1 | cut -f1)
free=$(df --output=avail -k /root | tail -n1)
((free > need + 1048576)) || die "not enough free disk for the backup (need about $((need / 1024)) MB plus 1 GB); nothing was removed"
mkdir -m 0700 "$WORK"
# shellcheck disable=SC2024  # root writes the dump into its own private folder, which is the point
if ((PG)); then sudo -u postgres pg_dumpall >"$WORK/postgresql-all.sql"; fi
if [[ $REDIS == open ]]; then
  redis-cli save >/dev/null
  rdb="$(redis-cli config get dir | tail -n1)/$(redis-cli config get dbfilename | tail -n1)"
  if [[ -f $rdb ]]; then
    cp "$rdb" "$WORK/redis-dump.rdb"
  else
    REDIS=unsaved
    warn "could not find Redis's data file to back up, so Redis is left as it is"
  fi
fi
if command -v crontab >/dev/null; then
  crontab -l >"$WORK/crontab-root.txt" 2>/dev/null || true
  for u in "${USERS[@]}"; do crontab -l -u "$u" >"$WORK/crontab-$u.txt" 2>/dev/null || true; done
fi
((${#USERS[@]} == 0)) || getent passwd "${USERS[@]}" >"$WORK/users.txt" || true
for f in "${NGINX[@]}" "${CRON[@]}"; do cp -a --parents "$f" "$WORK/"; done
for u in "${UNITS[@]}"; do cp -a --parents "/etc/systemd/system/$u" "$WORK/"; done
((${#CERTS[@]} == 0)) || cp -a --parents /etc/letsencrypt "$WORK/"
rel=()
for p in "${PATHS[@]}"; do rel+=("${p#/}"); done
status=0
from_root=()
((${#rel[@]} == 0)) || from_root=(-C / "${rel[@]}")
tar -czf "$ARCHIVE" -C "$WORK" . "${from_root[@]}" 2>"$WORK.tar.log" || status=$?
# tar exits 1 when a file changed while it was read (logs), which is fine; 2 means the archive is broken.
((status <= 1)) || die "the backup failed (see $WORK.tar.log); nothing was removed. The other apps are stopped."
tar -tzf "$ARCHIVE" >/dev/null || die "the backup can't be read back; nothing was removed. The other apps are stopped."
chmod 0600 "$ARCHIVE"
rm -rf -- "$WORK" "$WORK.tar.log"
note "$(size "$ARCHIVE") written"

# ------------------------------------------------------------------------------------------------- remove
step "Removing"
# Nginx first: it is the one step that can be tested and put back, so a failure here leaves everything else.
if ((${#NGINX[@]})); then
  stash=$(mktemp -d)
  for f in "${NGINX[@]}"; do
    mkdir -p "$stash$(dirname "$f")"
    mv "$f" "$stash$f"
  done
  if ! nginx -t >/dev/null 2>&1; then
    for f in "${NGINX[@]}"; do mv "$stash$f" "$f"; done
    die "Nginx failed its config test without those sites, so they were put back and nothing else was removed. The other apps are stopped; the backup is $ARCHIVE"
  fi
  rm -rf -- "$stash"
  systemctl reload nginx
  note "Nginx: other sites removed"
fi

for u in "${UNITS[@]}"; do safe_rm "/etc/systemd/system/$u"; done
systemctl daemon-reload >/dev/null 2>&1 || true

for c in "${CERTS[@]}"; do certbot delete --cert-name "$c" --non-interactive >/dev/null 2>&1 || warn "could not delete certificate $c"; done
for f in "${CRON[@]}"; do rm -f -- "$f"; done
if command -v crontab >/dev/null; then
  ((ROOT_CRONTAB == 0)) || crontab -r 2>/dev/null || true
  for u in "${USERS[@]}"; do crontab -r -u "$u" 2>/dev/null || true; done
fi

if ((PG)); then
  for d in "${DBS[@]}"; do printf 'DROP DATABASE IF EXISTS :"n" WITH (FORCE);\n' | psql_q -v n="$d" >/dev/null; done
  mapfile -t remaining < <(psql_q -c "select datname from pg_database where datallowconn")
  for r in "${ROLES[@]}"; do
    for d in "${remaining[@]}"; do
      # Drops what the user created in the databases that stay (tables in "postgres", grants); all of it
      # is in the backup's postgresql-all.sql.
      printf 'DROP OWNED BY :"n";\n' | psql_q -d "$d" -v n="$r" >/dev/null 2>&1 || true
    done
    printf 'DROP ROLE IF EXISTS :"n";\n' | psql_q -v n="$r" >/dev/null || warn "could not remove PostgreSQL user $r"
  done
  note "PostgreSQL: other databases and users removed"
fi
if [[ $REDIS == open ]]; then
  redis-cli flushall >/dev/null
  note "Redis: emptied"
fi

for u in "${USERS[@]}"; do userdel -f "$u" 2>/dev/null || warn "could not remove user $u"; done
for p in "${PATHS[@]}"; do safe_rm "$p"; done

step "Done"
note "Everything listed above is gone. The backup is $ARCHIVE (readable by root only)."
note "Keep it for a week or two, then delete it:  rm $ARCHIVE"
note "Next, make Coinside the default site for unknown host names:"
note "  bash /srv/coinside/current/deploy/bootstrap.sh"
