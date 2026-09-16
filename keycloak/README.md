# Keycloak setup notes

Realm `auth-learn` is auto-imported from `import/auth-learn-realm.json` on first boot
(`start-dev --import-realm`). Import only runs when the realm does **not** already exist.

`import/auth-learn-realm.json` is a **full Keycloak export** (`kc.sh export`) — it is
self-consistent and re-imports the entire realm including clients, roles, groups, users,
protocol mappers, Authorization Services config, client secrets, and the unmanaged-attribute
policy. `auth-learn-realm.handwritten.json` (one level up, NOT auto-imported) is the earlier
hand-written version kept for readability/reference.

## Re-import after wiping

```bash
docker compose down -v      # drops the Postgres volume = wipes Keycloak DB
docker compose up -d        # fresh import from the full export
```

## What the realm contains

- **Clients**
  - `spa-client` — Auth Code + PKCE, public (port 5173)
  - `spa-implicit` — Implicit flow, legacy, public (port 5174)
  - `spa-oidc` — Auth Code + PKCE + `openid`, public (port 5175)
  - `bff-client` — confidential (secret `bff-secret`), server-side BFF (port 5176/5080)
  - `orders-authz` — confidential resource server with **Authorization Services** enabled
    (secret `orders-authz-secret`)
  - SPA/BFF clients carry `groups`, `department`, and `audience(orders-api)` mappers.
- **Roles**: `admin`, `orders.read`, `orders.write`, composite `orders.manager` (bundles read+write).
- **Group**: `SuperAdmins` — assigned the `orders.manager` composite role.
- **Authorization Services** (`orders-authz`): resource `orders`, scope `orders:delete`,
  role policy "Only admin role", scope permission binding them.
- **Users**:
  - `test` / `test` — role `admin`, group `SuperAdmins`, attribute `department=finance`.
  - `plain` / `plain` — no role/group/attribute (negative tests).

Secrets are hardcoded here for local learning only — never do this in production.

## Unmanaged attributes

Keycloak 24+ blocks custom user attributes by default. The full export captures
`unmanagedAttributePolicy: ENABLED`, so the `department` attribute survives re-import.
If you ever see `department` missing from tokens: Realm Settings → User profile →
Unmanaged Attributes → Enabled.

## Endpoints and the authorization they demonstrate

| Endpoint | Requires | Mechanism |
|----------|----------|-----------|
| `/hello` | any valid token | authentication only |
| `/orders` | any valid token | authentication only |
| `/admin/claims` | realm role `admin` | realm role |
| `/superadmin` | group `SuperAdmins` | group membership |
| `/finance/orders` | role `orders.write` AND `department=finance` | group → composite role + claim |
| `PUT /orders/{id}` | role `orders.write` + order's dept == caller's dept | resource-based (in-code) |
| `DELETE /orders/{id}` | Keycloak policy grants `orders:delete` | Authorization Services (UMA) |
