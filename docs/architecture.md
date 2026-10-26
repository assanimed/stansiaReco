# System Architecture & Technical Specifications

## 1. System Overview & Architectural Vision

StansiaReco is a secure, production-minded infrastructure control plane for managing:
1. **Namecheap Domains**: Synchronizing domain inventory, nameserver state, expiration, and registrar lock.
2. **DNS Records**: Safe, validated listing and atomic mutations of DNS host records with diff previews and audit logging.
3. **Server Inventory**: Centralized registry of remote Linux hosts categorized by environment, tags, and OS metadata.
4. **SSH Credential Management**: Hardware/software private keys and passwords protected via AES-256-GCM envelope encryption.
5. **Remote Command & Script Execution**: A controlled, asynchronous execution engine with strict parameter validation, pre-registered scripts, timeout enforcement, output streaming/bounds, and state machine transitions.
6. **Extensible Core**: Designed with clean domain boundaries so future email infrastructure (Postfix, Dovecot, DKIM/SPF/DMARC, SMTP provisioning) can be added without architectural rewrites.

### High-Level Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                Client Browser                                     |
+-----------------------------------------------------------------------------------+
                                         |
                                         | HTTPS (JSON / REST)
                                         v
+-----------------------------------------------------------------------------------+
|                        Next.js 16.4 Dashboard (Frontend)                          |
|  - Root `app/` Directory (App Router)                                             |
|  - Server Components by Default (Layouts, Shell, Initial Data)                     |
|  - Client Components for Interactive Tables, Forms, Live Log Polling              |
|  - Tailwind CSS + shadcn/ui Primitives + TanStack Query + React Hook Form + Zod  |
+-----------------------------------------------------------------------------------+
                                         |
                                         | /api/v1 REST
                                         v
+-----------------------------------------------------------------------------------+
|                             Go API Server (Backend)                               |
|                                                                                   |
|  +-------------------+  +-------------------+  +-------------------------------+  |
|  | Authentication &  |  | Domain & DNS      |  | Server Inventory &            |  |
|  | Authorization     |  | Management        |  | Credential Vault              |  |
|  | (Argon2id, RBAC)  |  | (Namecheap SDK)   |  | (AES-256-GCM)                 |  |
|  +-------------------+  +-------------------+  +-------------------------------+  |
|  +-------------------+  +-------------------+  +-------------------------------+  |
|  | Remote Execution  |  | Audit Logging &   |  | Outbound Network Policy       |  |
|  | API & Jobs Store  |  | Observability     |  | & SSRF Guard (Anti-Rebinding) |  |
|  +-------------------+  +-------------------+  +-------------------------------+  |
+-----------------------------------------------------------------------------------+
            |                                                      |
            | SQL (pgx pool)                                       | Job Enqueue
            v                                                      v
+-----------------------+                    +--------------------------------------+
|  PostgreSQL 17        | <----------------- | Background Worker Process            |
|  - Users & Sessions   |   FOR UPDATE       | - Native Go SSH Runner (x/crypto/ssh)|
|  - Domains & DNS      |   SKIP LOCKED      | - Namecheap Periodic Sync            |
|  - Servers & Secrets  |   (Atomic Leases)  | - Script Parameter Sandboxing        |
|  - Execution Jobs     |                    | - Heartbeat & Stale Job Recovery     |
|  - Audit Log Trail    |                    +--------------------------------------+
+-----------------------+                                      |
                                                               | SSH (Port 22 / custom)
                                                               v
                                             +--------------------------------------+
                                             | Managed Remote Target Servers        |
                                             | - Controlled Execution               |
                                             | - Pinned Host-Key Verification       |
                                             +--------------------------------------+
```

---

## 2. Key Architectural Decisions & Trade-Offs

### 2.1 Modular Monolith vs. Microservices
* **Decision**: Single Go codebase with strict internal package boundaries (`internal/domains`, `internal/servers`, `internal/execution`, etc.) and separate entrypoints (`cmd/api`, `cmd/worker`).
* **Rationale**: Eliminates distributed systems overhead (distributed tracing, network latency, multiple deployment pipelines, distributed transactions) while maintaining strict domain encapsulation. The worker package can be built into the same binary or deployed as a standalone worker container sharing the database.

### 2.2 Go Native SSH (`golang.org/x/crypto/ssh`) vs. System OpenSSH Exec
* **Decision**: Native Go SSH client via `golang.org/x/crypto/ssh`.
* **Rationale**:
  - Eliminates command injection vulnerabilities inherent in fork/exec string building.
  - Fine-grained memory control: private keys and passphrases are never passed through process arguments or environment variables where `/proc` or `ps aux` could inspect them.
  - Direct control over TCP dials, timeouts, session lifecycle, and standard streams (stdout/stderr io.Reader capture with byte limits).
  - Accurate SSH host-key verification callback (`ssh.HostKeyCallback`) supporting per-server pinned keys without touching external `~/.ssh/known_hosts` files.

### 2.3 Database Layer: `pgx/v5` with Explicit SQL vs. ORM
* **Decision**: Native PostgreSQL driver `github.com/jackc/pgx/v5` using connection pooling (`pgxpool`) and explicit typed SQL queries with transactions.
* **Rationale**:
  - Mission-critical queries (such as atomic job claiming via `FOR UPDATE SKIP LOCKED`, lease heartbeats, and DNS batch replacements) require explicit, unambiguous SQL semantics.
  - Maximum query performance and predictable query plans.
  - Zero runtime reflection magic.

### 2.4 Asynchronous Background Processing: PostgreSQL Queue vs. Redis/RabbitMQ
* **Decision**: PostgreSQL-backed job queue with `SKIP LOCKED` leasing, heartbeats, and bounded retries.
* **Rationale**:
  - PostgreSQL is already the authoritative datastore. Using it for job queues avoids adding Redis or RabbitMQ infrastructure dependencies for the initial releases.
  - ACID transactions: Creating a server execution job and writing the corresponding audit log happens atomically in the same database transaction.
  - Easy state recovery: If a worker crashes, the lease expiration timestamp (`heartbeat_at < NOW() - INTERVAL '2 minutes'`) triggers automated stale-job recovery.

### 2.5 Frontend: Next.js 16 App Router without API Proxying
* **Decision**: Next.js App Router (located at root `app/`), using Server Components for page framing and layout, and Client Components communicating directly with the Go REST API (`/api/v1`) via standard typed fetch clients and TanStack Query.
* **Rationale**:
  - Clean separation: Go handles authentication, rate limiting, and business validation. Next.js does not act as a slow, redundant middleman proxy.
  - Fast rendering and type safety shared via OpenAPI/TypeScript types.

---

## 3. Threat Model & Security Architecture

As an infrastructure control plane possessing SSH keys and domain registrar API keys, StansiaReco requires high-assurance defense against the following vectors:

### 3.1 SSRF & Outbound Dial Policy (Anti-Rebinding)
* **Risk**: An attacker registers an IP/hostname such as `169.254.169.254` (cloud metadata service), `127.0.0.1` (loopback), or `10.0.0.0/8` (internal network), or uses a DNS rebinding service to access internal network assets.
* **Defense**:
  1. **Strict IP Blocklist**: By default, connections to loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`, `fe80::/10`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and carrier-grade NAT (`100.64.0.0/10`) are blocked.
  2. **Explicit Override**: Only an Administrator can check `Allow Private Network Connection` on a server record.
  3. **DNS Rebinding Protection**: The dialer resolves the target hostname using a secure resolver, validates *every* resolved IP address against the policy, and dials the *specific validated IP address* directly over TCP. It does not pass the hostname to `net.Dial` a second time.

### 3.2 SSH Host-Key Verification
* **Risk**: Man-In-The-Middle (MITM) attacks intercepting SSH sessions to exfiltrate keys or inject commands.
* **Defense**:
  - `ssh.InsecureIgnoreHostKey()` is strictly forbidden in production.
  - Each server record stores an optional `pinned_host_key` (SHA256 fingerprint or base64 public key).
  - During connection test or execution, the host key received during SSH handshake is verified against the pinned key. If unpinned, the system enters Trust-On-First-Use (TOFU) with explicit administrator confirmation and persistent storage.

### 3.3 Credential Vault Encryption (AES-256-GCM)
* **Risk**: Database dump or unauthorized SQL read exposes SSH private keys, passphrases, and Namecheap API keys.
* **Defense**:
  - All secrets are encrypted at rest using AES-256-GCM with a 96-bit unique random nonce per ciphertext.
  - Master key is provided via environment variable (`APP_ENCRYPTION_KEY`, 32 bytes hex-encoded) or KMS.
  - Secret versions (`key_version = 1`) are tracked to allow seamless re-encryption during key rotation.
  - Secret values are *never* returned in API responses; only fingerprints, types, and masked labels are returned.

### 3.4 Command Sandboxing & Script Registry
* **Risk**: Operator executes arbitrary malicious scripts (e.g., `rm -rf /`, reverse shell injection, unauthorized exfiltration).
* **Defense**:
  - Predefined Script Registry: Only approved, versioned scripts with verified schemas can be executed.
  - No raw shell string interpolation: Script arguments are validated against strict regex/whitelists and passed safely as positional parameters (`$1`, `$2`) or restricted environment variables (`PARAM_*`).
  - Strict resource limits: Maximum execution timeout (default 60s, hard cap 600s), stdout/stderr output caps (1 MB maximum per stream; further output is truncated with a clear banner), and single-execution-per-server concurrency limits.

### 3.5 Authentication & RBAC
* **Authentication**: Argon2id (`time=3, memory=64MB, threads=2`) for password hashing. Cryptographically random session tokens (32 bytes from `crypto/rand`) stored as SHA-256 hashes in PostgreSQL.
* **Roles**:
  - **Administrator**: Full access to credentials, integrations, user management, server inventory, DNS changes, and execution policies.
  - **Operator**: Read-only domain/server views and execution of approved diagnostic scripts on authorized servers.
* **Audit Trail**: Every authentication event, DNS modification, server mutation, and script execution is written to an immutable `audit_logs` table with requesting user ID, IP address, user agent, and structured diffs.

---

## 4. Database Schema (PostgreSQL 17)

```sql
-- 1. Users & Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'operator', -- 'admin', 'operator'
    full_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hex
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- 2. Integrations (Namecheap)
CREATE TABLE provider_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_type VARCHAR(64) NOT NULL, -- 'namecheap'
    name VARCHAR(255) NOT NULL,
    api_user VARCHAR(255) NOT NULL,
    account_user VARCHAR(255) NOT NULL,
    encrypted_api_key BYTEA NOT NULL,
    key_version INT NOT NULL DEFAULT 1,
    client_ip VARCHAR(45) NOT NULL,
    environment VARCHAR(32) NOT NULL DEFAULT 'sandbox', -- 'sandbox', 'production'
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_synced_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Domains & DNS
CREATE TABLE domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES provider_integrations(id) ON DELETE SET NULL,
    domain_name VARCHAR(255) NOT NULL UNIQUE,
    provider_domain_id VARCHAR(128),
    is_locked BOOLEAN NOT NULL DEFAULT false,
    auto_renew BOOLEAN NOT NULL DEFAULT false,
    uses_namecheap_dns BOOLEAN NOT NULL DEFAULT true,
    nameservers TEXT[] NOT NULL DEFAULT '{}',
    status VARCHAR(64) NOT NULL DEFAULT 'active', -- 'active', 'expired', 'sync_error'
    expires_at TIMESTAMPTZ,
    provider_created_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_domains_domain_name ON domains(domain_name);
CREATE INDEX idx_domains_status ON domains(status);

CREATE TABLE dns_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    record_type VARCHAR(16) NOT NULL, -- 'A', 'AAAA', 'CNAME', 'MX', 'TXT', etc.
    host_name VARCHAR(255) NOT NULL,
    record_value TEXT NOT NULL,
    ttl INT NOT NULL DEFAULT 1800,
    mx_priority INT,
    is_managed BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dns_records_domain_id ON dns_records(domain_id);

-- 4. SSH Credentials & Server Inventory
CREATE TABLE credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    cred_type VARCHAR(32) NOT NULL, -- 'password', 'private_key', 'private_key_passphrase'
    username VARCHAR(128) NOT NULL,
    encrypted_secret BYTEA NOT NULL,
    key_version INT NOT NULL DEFAULT 1,
    fingerprint VARCHAR(128),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    hostname_or_ip VARCHAR(255) NOT NULL,
    ssh_port INT NOT NULL DEFAULT 22,
    os_info VARCHAR(128),
    environment VARCHAR(32) NOT NULL DEFAULT 'dev', -- 'dev', 'staging', 'prod', 'email', 'dns'
    tags TEXT[] NOT NULL DEFAULT '{}',
    description TEXT,
    credential_id UUID REFERENCES credentials(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    allow_private_ip BOOLEAN NOT NULL DEFAULT false,
    pinned_host_key TEXT,
    last_tested_at TIMESTAMPTZ,
    last_test_status VARCHAR(32), -- 'success', 'failed'
    last_test_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_servers_environment ON servers(environment);
CREATE INDEX idx_servers_hostname ON servers(hostname_or_ip);

-- 5. Approved Script Registry
CREATE TABLE script_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    script_content TEXT NOT NULL,
    allowed_parameters JSONB NOT NULL DEFAULT '[]', -- Parameter schema validation
    timeout_seconds INT NOT NULL DEFAULT 60,
    is_dangerous BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Remote Execution Jobs
CREATE TABLE execution_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    requested_by_user_id UUID NOT NULL REFERENCES users(id),
    script_slug VARCHAR(64) NOT NULL REFERENCES script_registry(slug),
    parameters JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'queued', 'running', 'success', 'failed', 'cancelled'
    exit_code INT,
    stdout TEXT,
    stderr TEXT,
    stdout_truncated BOOLEAN NOT NULL DEFAULT false,
    stderr_truncated BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    worker_id VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_execution_jobs_status ON execution_jobs(status);
CREATE INDEX idx_execution_jobs_server_id ON execution_jobs(server_id);
CREATE INDEX idx_execution_jobs_queued_at ON execution_jobs(queued_at);

-- 7. Audit Logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128),
    details JSONB NOT NULL DEFAULT '{}',
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

---

## 5. Technology Stack & Exact Versions

| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Backend Language** | Go | `1.23` | High concurrency, type safety, low memory footprint |
| **HTTP Router** | Chi | `v5.1.0` | Minimalist idiomatic Go router |
| **Database** | PostgreSQL | `17` | Relational storage with JSONB, array types, and robust ACID |
| **DB Driver** | pgx / pgxpool | `v5.7.2` | High-performance PostgreSQL driver |
| **Migrations** | golang-migrate | `v4.18.2` | Deterministic SQL up/down migrations |
| **Hashing** | Argon2id | `golang.org/x/crypto/argon2` | Password hashing resisting GPU cracking |
| **SSH Client** | Go SSH | `golang.org/x/crypto/ssh` | Direct in-memory SSH client |
| **Encryption** | AES-256-GCM | Go standard `crypto/cipher` | Authenticated encryption for secret payloads |
| **Frontend Framework** | Next.js | `16.4.0` | React 19 App Router, server & client components |
| **UI Primitives** | Radix UI / Tailwind | `v4` / `@radix-ui/*` | Accessible headless UI styled with Tailwind |
| **State & Fetching** | TanStack Query | `v5` | Client-side caching and background refetching |
| **Forms & Validation** | React Hook Form + Zod | `v7` / `v3` | Validated type-safe user inputs |
| **Icons** | Lucide React | `latest` | Clean modern iconography |
| **Containerization** | Docker & Compose | Compose spec | Local reproducible dev/test orchestration |
