#!/usr/bin/env bash
# Build a Coinside release, switch to it, and switch back by itself if it doesn't come up healthy.
# Installed as /usr/local/bin/coinside-deploy by deploy/bootstrap.sh. Run it as root or as coinside.
#
#   coinside-deploy [REF]        deploy a branch, tag or commit (default: the repository's default branch)
#   coinside-deploy rollback     go back to the previous good release
#   coinside-deploy status       live release, processes, health checks, pending reboot
#   coinside-deploy logs [APP]   follow the logs of web, api, engine, indexer or worker (default: all)
#
#   --skip-checks                build without running the typecheck and unit tests first
#
# Layout under /srv/coinside: repo.git (a bare clone), releases/<UTC time>-<commit>/, and current, a
# symlink to the live release. A release is installed and built in its own directory while the live one
# keeps serving. Only then does `current` move (one atomic rename) and PM2 reload. Unless every process
# comes up on the new release, passes its health check and stays up, `current` moves back. The newest 5
# releases are kept for rollback.
# shellcheck disable=SC2016  # the single-quoted node -e programs use JavaScript template strings
set -Eeuo pipefail

APP_USER=coinside
APP_HOME=${COINSIDE_HOME:-/srv/coinside}
ENV_FILE=${COINSIDE_ENV_FILE:-/etc/coinside/coinside.env}
KEEP=${KEEP_RELEASES:-5}
REPO=$APP_HOME/repo.git
RELEASES=$APP_HOME/releases
CURRENT=$APP_HOME/current
APPS=(web api engine indexer worker)
SELF=$(readlink -f "${BASH_SOURCE[0]}")

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

if [[ $EUID -eq 0 ]]; then
  exec sudo -u "$APP_USER" -H --preserve-env=COINSIDE_HOME,COINSIDE_ENV_FILE,KEEP_RELEASES "$SELF" "$@"
fi
[[ $(id -un) == "$APP_USER" ]] || die "run this as root or as $APP_USER, not as $(id -un)"

umask 027
cd "$APP_HOME"
export COINSIDE_ENV_FILE=$ENV_FILE COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1 \
  TURBO_TELEMETRY_DISABLED=1

BUILDING=
# Inside $(...) and pipelines the caller handles the result, so only the main shell reports and cleans up.
on_error() {
  local status=$?
  ((BASH_SUBSHELL == 0)) || exit "$status"
  if [[ -n $BUILDING ]]; then
    cd "$APP_HOME"
    rm -rf "$BUILDING"
    die "the build failed (line $1: $2). The live site was not touched."
  fi
  die "line $1 failed: $2"
}
trap 'on_error $LINENO "$BASH_COMMAND"' ERR

# Export every variable in the env file, parsed exactly as PM2 (ecosystem.config.cjs) and Node parse it.
load_env() {
  [[ -r $ENV_FILE ]] || die "can't read $ENV_FILE. Run deploy/bootstrap.sh first."
  local kv
  while IFS= read -r -d '' kv; do export "${kv?}"; done < <(node -e '
    const { parseEnv } = require("node:util");
    const env = parseEnv(require("node:fs").readFileSync(process.argv[1], "utf8"));
    for (const [k, v] of Object.entries(env))
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) process.stdout.write(`${k}=${v}\0`);
  ' "$ENV_FILE")
}

health_urls() {
  printf '%s\n' \
    "web http://127.0.0.1:${WEB_PORT:-3000}/" \
    "api http://127.0.0.1:${API_PORT:-4000}/api/health" \
    "engine http://127.0.0.1:${ENGINE_HEALTH_PORT:-4101}/health" \
    "indexer http://127.0.0.1:${INDEXER_HEALTH_PORT:-4102}/health" \
    "worker http://127.0.0.1:${WORKER_HEALTH_PORT:-4103}/health"
}

# Prints "<restart count> <problem>; <problem>..." for our PM2 processes. A problem is a process that is
# missing, not online, or (when a release is given) running a different release.
pm2_state() {
  pm2 jlist 2>/dev/null | node -e '
    const [release, ...apps] = process.argv.slice(1);
    const lines = require("node:fs").readFileSync(0, "utf8").split("\n").filter((l) => l.startsWith("["));
    const list = JSON.parse(lines.at(-1) ?? "[]");
    const problems = [];
    let restarts = 0;
    for (const app of apps) {
      const procs = list.filter((p) => p.name === app);
      if (!procs.length) problems.push(`${app} is not running`);
      for (const { pm2_env: e } of procs) {
        restarts += e.restart_time;
        const rel = e.COINSIDE_RELEASE ?? e.env?.COINSIDE_RELEASE;
        if (e.status !== "online") problems.push(`${app} is ${e.status}`);
        else if (release && rel !== release) problems.push(`${app} runs ${rel ?? "an unknown release"}`);
      }
    }
    console.log(`${restarts} ${problems.join("; ")}`);
  ' "${1:-}" "${APPS[@]}"
}

# Every process online on RELEASE, every health check answering for RELEASE, and no restarts for 10 s.
verify() {
  local release=$1 deadline=$((SECONDS + 90)) app url state before after
  while read -r app url; do
    if [[ $app == web ]]; then
      until curl -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; do
        ((SECONDS < deadline)) || { warn "$app: no answer from $url"; return 1; }
        sleep 1
      done
    else
      until curl -fsS --max-time 5 "$url" 2>/dev/null | grep -qF "\"release\":\"$release\""; do
        ((SECONDS < deadline)) || { warn "$app: no healthy answer from $url for $release"; return 1; }
        sleep 1
      done
    fi
    note "$app answers"
  done < <(health_urls)
  state=$(pm2_state "$release")
  [[ $state == *' ' ]] || { warn "${state#* }"; return 1; }
  before=${state%% *}
  sleep 10
  state=$(pm2_state "$release")
  after=${state%% *}
  [[ $state == *' ' ]] || { warn "${state#* }"; return 1; }
  ((after == before)) || { warn "a process restarted $((after - before)) time(s) in 10 seconds"; return 1; }
  note "all processes are online on $release and stayed up for 10 seconds"
}

# True if a program other than ours listens on TCP port $1. Without root, ss only names our own processes,
# so a listener with no process shown belongs to someone else.
port_taken() {
  local lines
  lines=$(ss -ltnpH "sport = :$1") || true
  [[ -n $lines ]] || return 1
  grep -q 'pid=' <<<"$lines" || return 0
  return 1
}

switch_to() {
  ln -sfn "releases/$1" "$CURRENT.next"
  mv -Tf "$CURRENT.next" "$CURRENT"
}

reload() {
  COINSIDE_ROOT=$CURRENT COINSIDE_RELEASE=$1 pm2 startOrReload "$CURRENT/ecosystem.config.cjs" --update-env
}

live_release() {
  [[ -L $CURRENT ]] && basename "$(readlink "$CURRENT")"
  return 0
}

# Releases that built, oldest first, leaving out any that failed their health checks.
good_releases() {
  local d
  while IFS= read -r d; do
    [[ -f $RELEASES/$d/.built && ! -f $RELEASES/$d/.failed ]] && echo "$d"
  done < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
  return 0
}

# Keep the live release and the newest KEEP good ones. Of the failed releases keep only the newest, for
# its logs. Anything else (a build that was interrupted) goes.
prune() {
  local live d keep=() failed=()
  live=$(live_release)
  mapfile -t keep < <(good_releases | tail -n "$KEEP")
  while IFS= read -r d; do
    [[ -f $RELEASES/$d/.failed ]] && failed+=("$d")
  done < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
  ((${#failed[@]})) && keep+=("${failed[-1]}")
  while IFS= read -r d; do
    [[ $d == "$live" || " ${keep[*]} " == *" $d "* ]] || rm -rf "${RELEASES:?}/$d"
  done < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%f\n')
  return 0
}

# One line per deploy or rollback in /srv/coinside/deploys.log: when, who, what, and how it ended.
record() {
  printf '%s %s %s\n' "$(date -u +%FT%TZ)" "${SUDO_USER:-$(id -un)}" "$*" >>"$APP_HOME/deploys.log"
}

# Files that bootstrap.sh installs outside the release. Say so when a release changes one of them.
check_drift() {
  local rel=$1 pair src dst changed=()
  for pair in \
    "deploy/coinside-deploy.sh:/usr/local/bin/coinside-deploy" \
    "deploy/nginx/coinside.fun.conf:/etc/nginx/sites-available/coinside.fun" \
    "deploy/nginx/snippets/coinside-headers.conf:/etc/nginx/snippets/coinside-headers.conf" \
    "deploy/nginx/snippets/coinside-proxy.conf:/etc/nginx/snippets/coinside-proxy.conf" \
    "deploy/nginx/snippets/coinside-tls.conf:/etc/nginx/snippets/coinside-tls.conf" \
    "deploy/system/pm2-coinside.service:/etc/systemd/system/pm2-coinside.service"; do
    src=$rel/${pair%%:*} dst=${pair#*:}
    [[ -f $src ]] || continue
    # bootstrap.sh drops the IPv6 listeners on a server without IPv6; compare like with like.
    if [[ $dst == /etc/nginx/* && ! -e /proc/net/if_inet6 ]]; then
      cmp -s <(grep -v 'listen \[::\]' "$src") "$dst" || changed+=("$dst")
    else
      cmp -s "$src" "$dst" || changed+=("$dst")
    fi
  done
  ((${#changed[@]} == 0)) || warn "this release changes ${changed[*]}. To apply: sudo bash $CURRENT/deploy/bootstrap.sh"
  local missing
  missing=$(comm -23 <(grep -oE '^[A-Z_][A-Z0-9_]*=' "$rel/.env.example" | sort -u) \
    <(grep -oE '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE" | sort -u) | tr -d = | paste -sd ' ')
  [[ -z $missing ]] || warn "$ENV_FILE has no line for $missing (the built-in defaults apply; see .env.example)"
  return 0
}

deploy() {
  local ref=${1:-} sha name rel prev avail started=$SECONDS
  exec 9>"$APP_HOME/.deploy.lock"
  flock -n 9 || die "another deploy is running"
  load_env
  avail=$(df --output=avail -k "$APP_HOME" | tail -n1)
  ((avail > 3 * 1024 * 1024)) || die "less than 3 GB free under $APP_HOME; remove old files first"
  local port
  for port in "${WEB_PORT:-3000}" "${API_PORT:-4000}" "${ENGINE_HEALTH_PORT:-4101}" \
    "${INDEXER_HEALTH_PORT:-4102}" "${WORKER_HEALTH_PORT:-4103}"; do
    if port_taken "$port"; then
      die "port $port is used by another program. Run deploy/bootstrap.sh again as root: it moves Coinside to free ports."
    fi
  done

  step "Fetching"
  git -C "$REPO" fetch --quiet --prune --tags origin
  # No ref: whatever GitHub currently calls the default branch (a bare clone only records it once).
  [[ -n $ref ]] || ref=$(git -C "$REPO" ls-remote --symref origin HEAD | awk '$1 == "ref:" { sub("refs/heads/", "", $2); print $2 }')
  [[ -n $ref ]] || ref=$(git -C "$REPO" symbolic-ref --short HEAD)
  sha=$(git -C "$REPO" rev-parse --verify --quiet "$ref^{commit}") || die "no branch, tag or commit called $ref"
  name=$(date -u +%Y%m%d-%H%M%S)-${sha:0:7}
  rel=$RELEASES/$name
  note "$ref is at $sha"

  step "Building release $name"
  BUILDING=$rel
  mkdir "$rel"
  git -C "$REPO" archive "$sha" | tar -x -C "$rel"
  echo "$sha" >"$rel/REVISION"
  cd "$rel"
  # NODE_ENV=production would make pnpm skip the dev dependencies the build needs, and makes React
  # tests run against the production build, so it is only set for the build itself.
  env -u NODE_ENV pnpm install --frozen-lockfile
  if ((CHECKS)); then
    step "Typecheck and unit tests"
    env -u NODE_ENV pnpm turbo run typecheck test
  fi
  step "Production build"
  pnpm turbo run build
  touch "$rel/.built"
  BUILDING=
  cd "$APP_HOME"
  check_drift "$rel"

  step "Switching to $name"
  prev=$(live_release)
  switch_to "$name"

  step "Health checks"
  if reload "$name" && verify "$name"; then
    pm2 save --force >/dev/null
    record "deploy $ref $sha $name live"
    prune
    step "Live: $name ($((SECONDS - started)) s)"
    note "check it: coinside-deploy status"
    return 0
  fi

  touch "$rel/.failed"
  if [[ -n $prev ]]; then
    warn "release $name is unhealthy; switching back to $prev"
    switch_to "$prev"
    reload "$prev"
    verify "$prev" || warn "$prev is not healthy either"
    pm2 save --force >/dev/null
    record "deploy $ref $sha $name failed, back on $prev"
    die "release $name failed its health checks and $prev is live again. See: coinside-deploy logs"
  fi
  record "deploy $ref $sha $name failed, nothing to go back to"
  die "release $name failed its health checks and there is no earlier release to go back to. See: coinside-deploy logs"
}

rollback() {
  local live target
  exec 9>"$APP_HOME/.deploy.lock"
  flock -n 9 || die "a deploy is running"
  load_env
  live=$(live_release)
  [[ -n $live ]] || die "nothing is deployed yet"
  target=$(good_releases | awk -v live="$live" '$0 < live' | tail -n1)
  [[ -n $target ]] || die "no earlier good release to roll back to"
  step "Rolling back from $live to $target"
  switch_to "$target"
  reload "$target"
  verify "$target" || die "$target did not come up healthy. See: coinside-deploy logs"
  pm2 save --force >/dev/null
  record "rollback $live -> $target live"
  step "Live: $target"
}

status() {
  local live app url body
  load_env
  live=$(live_release)
  step "Release"
  if [[ -n $live ]]; then note "live: $live (commit $(cat "$CURRENT/REVISION"))"; else note "nothing deployed yet"; fi
  note "kept: $(good_releases | paste -sd ' ')"
  if [[ -f $APP_HOME/deploys.log ]]; then
    step "Recent deploys"
    tail -n 5 "$APP_HOME/deploys.log" | sed 's/^/    /'
  fi
  step "Processes"
  pm2 ls
  note "pm2-coinside.service: $(systemctl is-active pm2-coinside 2>/dev/null || true)"
  step "Health"
  while read -r app url; do
    if body=$(curl -fsS --max-time 3 "$url" 2>/dev/null); then
      [[ $app == web ]] && body="HTTP 200"
      note "$(printf '%-8s ok   %s' "$app" "${body:0:120}")"
    else
      note "$(printf '%-8s DOWN %s' "$app" "$url")"
    fi
  done < <(health_urls)
  if [[ -f /var/run/reboot-required ]]; then warn "a reboot is pending for system updates (PM2 starts everything again on boot)"; fi
}

CHECKS=1
args=()
for a in "$@"; do
  case $a in
    --skip-checks) CHECKS=0 ;;
    -h | --help) awk 'NR > 1 { if (!/^#/) exit; if (/^# shellcheck/) next; sub(/^# ?/, ""); print }' "$SELF"; exit 0 ;;
    -*) die "unknown option $a (see --help)" ;;
    *) args+=("$a") ;;
  esac
done
set -- "${args[@]}"

case ${1:-} in
  rollback) rollback ;;
  status) status ;;
  logs) exec pm2 logs ${2:+"$2"} --lines 100 ;;
  *) deploy "${1:-}" ;;
esac
