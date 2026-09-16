#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  echo ""
  echo "Stopping app processes... (Keycloak/Postgres keep running; 'docker compose down' to stop them)"
  kill 0
}
trap cleanup EXIT INT TERM

# 1. Keycloak + Postgres (Docker) — started detached, left running.
echo "Ensuring Keycloak + Postgres are up..."
docker compose -f "$ROOT/docker-compose.yml" up -d

echo "Waiting for Keycloak to be ready..."
until curl -sf http://localhost:8080/realms/auth-learn >/dev/null 2>&1; do
  sleep 2
done
echo "Keycloak ready."

# 2. Backend services (pin the http profile so ports are deterministic).
echo "Starting .NET Web API      (http://localhost:5111)..."
(cd "$ROOT/server" && dotnet run --launch-profile http) &

echo "Starting BFF               (http://localhost:5080)..."
(cd "$ROOT/bff" && dotnet run --launch-profile http) &

# 3. Frontends.
echo "Starting client code+PKCE  (http://localhost:5173)..."
(cd "$ROOT/client" && npm run dev) &

echo "Starting client implicit   (http://localhost:5174)..."
(cd "$ROOT/client-implicit" && npm run dev) &

echo "Starting client OIDC       (http://localhost:5175)..."
(cd "$ROOT/client-oidc" && npm run dev) &

echo "Starting client BFF        (http://localhost:5176)..."
(cd "$ROOT/client-bff" && npm run dev) &

cat <<'EOF'

────────────────────────────────────────────────
  Keycloak admin : http://localhost:8080  (admin/admin)
  Web API        : http://localhost:5111
  BFF            : http://localhost:5080

  client code+PKCE : http://localhost:5173
  client implicit  : http://localhost:5174
  client OIDC      : http://localhost:5175
  client BFF       : http://localhost:5176

  Test user: test / test    (admin role, SuperAdmins group, dept=finance)
  Ctrl+C stops the apps (Keycloak/Postgres keep running).
────────────────────────────────────────────────
EOF

wait
