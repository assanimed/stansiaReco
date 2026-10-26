# StansiaReco

A production-minded web application and infrastructure control plane for managing **Namecheap domains**, **DNS records**, **remote Linux server inventory**, and **secure remote command/script execution**.

---

## 1. System Overview

StansiaReco is engineered as a **Modular Monolith** using **Go (1.23)** for high performance and strict concurrency safety, coupled with **PostgreSQL 17** for transactional state persistence, and a modern **Next.js 16.4 (App Router)** dashboard.

```
       Browser (Next.js Dashboard)
                   │
                   │ HTTPS / JSON REST
                   ▼
          Go API Server (Port 8080)
   ┌────────────────────────────────────────┐
   │ ─ Authentication & RBAC (Argon2id)     │
   │ ─ Namecheap Provider Client            │
   │ ─ DNS Mutation & Validation Engine     │
   │ ─ Credential Vault (AES-256-GCM)       │
   │ ─ Anti-SSRF & Rebinding Dial Policy    │
   │ ─ Execution Job Coordination           │
   │ ─ Immutable Audit Logging              │
   └───────────────────┬────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   PostgreSQL 17              Background Worker
(ACID, SKIP LOCKED)      (Native Go SSH, Heartbeats)
```

### Key Architectural Decisions

1. **Modular Monolith**: Clean internal Go package boundaries (`internal/domains`, `internal/dns`, `internal/servers`, `internal/execution`, `internal/credentials`) prevent microservice overhead while enabling extraction into independent worker services if needed.
2. **Native Go SSH Client**: Employs `golang.org/x/crypto/ssh` rather than `os/exec` wrappers. This avoids shell-injection vulnerabilities, prevents leaking secrets via process arguments/`/proc`, and guarantees strict in-memory host-key verification.
3. **SSRF Guard with Anti-DNS Rebinding**: Target hostnames are resolved against a secure resolver; each resolved IP address is verified against a strict RFC 1918 / loopback / cloud-metadata blocklist; and outbound dials connect directly to the validated IP.
4. **Credential Vault**: SSH passwords, private keys, passphrases, and registrar API keys are encrypted at rest using **AES-256-GCM** with 96-bit random IVs and key versioning. Raw secrets are never returned over API endpoints.
5. **PostgreSQL-Backed Worker Queue**: Execution jobs use `FOR UPDATE SKIP LOCKED` for atomic leases, with periodic heartbeats and stale-job recovery.

---

## 2. Directory Structure

```
.
├── backend/
│   ├── cmd/
│   │   ├── api/             # Main HTTP REST API entrypoint
│   │   └── worker/          # Asynchronous job execution worker
│   ├── internal/
│   │   ├── config/          # Environment configuration & validation
│   │   ├── database/        # pgxpool connection pool & migrations runner
│   │   ├── http/            # Chi router, handlers, middleware (request ID, logging, CORS, recovery)
│   │   └── observability/   # slog structured JSON logger
│   ├── migrations/          # Versioned SQL migrations (embedded in binary)
│   ├── api/
│   │   └── openapi.yaml     # OpenAPI 3.1 specification
│   ├── Dockerfile           # Multi-stage production container
│   ├── go.mod
│   └── go.sum
├── frontend/
│   ├── app/                 # Next.js App Router (root app/, no src/)
│   │   ├── (auth)/login/    # Secure login page
│   │   ├── (dashboard)/     # Overview, Domains, Servers, Executions, Settings
│   │   └── globals.css      # Tailwind & theme variables
│   ├── components/          # Reusable UI primitives (Card, Badge, Button, Layout)
│   ├── lib/                 # Typed API client, utilities
│   ├── Dockerfile           # Multi-stage production container
│   ├── package.json
│   ├── next.config.ts
│   └── tsconfig.json
├── docs/
│   └── architecture.md      # Detailed architectural specifications & threat model
├── docker-compose.yml       # PostgreSQL 17 + API + Worker + Frontend
├── .env.example             # Documented environment template
├── Makefile                 # Development task runner
└── README.md
```

---

## 3. Quick Start & Local Development

### Prerequisites
- **Go 1.23+**
- **Node.js 22+ / npm**
- **PostgreSQL 17** (or Docker)

### Option A: Using Docker Compose
```bash
# 1. Copy environment configuration
cp .env.example .env

# 2. Build and launch all services (Postgres, API, Worker, Frontend)
docker compose up -d

# 3. View live logs
docker compose logs -f
```
- Frontend Dashboard: [http://localhost:3000](http://localhost:3000)
- Backend REST API: [http://localhost:8080](http://localhost:8080)
- API Health Check: [http://localhost:8080/healthz](http://localhost:8080/healthz)
- API Readiness Check: [http://localhost:8080/readyz](http://localhost:8080/readyz)

---

### Option B: Local Native Development

```bash
# 1. Ensure PostgreSQL is running and create the database
createdb stansiareco

# 2. Configure environment
export DATABASE_URL="postgres://localhost:5432/stansiareco?sslmode=disable"
export APP_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
export SESSION_SECRET="dev-secret-session-key-change-in-prod-min-32-chars"

# 3. Run backend tests
cd backend && go test -v ./...

# 4. Start the API server (automatically applies migrations on startup)
cd backend && go run ./cmd/api

# 5. In a second terminal, start the Next.js frontend
cd frontend
npm install
npm run dev
```

---

## 4. API Endpoints (Version 1)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/healthz` | Process liveness probe |
| `GET` | `/readyz` | Database connectivity readiness probe |
| `GET` | `/api/v1/version` | API version and environment metadata |
| `POST` | `/api/v1/auth/login` | Session login with Argon2id password verification |
| `POST` | `/api/v1/auth/logout` | Invalidate current session |
| `GET` | `/api/v1/auth/me` | Authenticated user profile & permissions |
| `POST` | `/api/v1/integrations/namecheap/test` | Validate Namecheap API connection |
| `POST` | `/api/v1/integrations/namecheap/sync` | Trigger asynchronous domain sync job |
| `GET` | `/api/v1/domains` | List synchronized domains with filters |
| `GET` | `/api/v1/domains/{id}/dns` | Retrieve DNS host records |
| `POST` | `/api/v1/domains/{id}/dns` | Safe DNS batch replacement mutation |
| `GET` | `/api/v1/servers` | Server inventory list |
| `POST` | `/api/v1/servers` | Register a new server |
| `POST` | `/api/v1/servers/{id}/test-connection` | Test SSH dial and host-key verification |
| `POST` | `/api/v1/credentials` | Store AES-256-GCM encrypted SSH credentials |
| `POST` | `/api/v1/executions` | Enqueue approved remote script execution |
| `GET` | `/api/v1/executions/{id}` | Inspect execution stdout/stderr streams |

---

## 5. Automated Testing & Verification

Run backend unit tests and static checks:
```bash
make test
make lint
```

Build production Next.js frontend:
```bash
cd frontend && npm run build
```
