-- Up migration: Remote Commands, Pre-configured Scripts Registry, and Live SSH Terminal support

ALTER TABLE script_registry
    ADD COLUMN IF NOT EXISTS category VARCHAR(64) NOT NULL DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS os_target VARCHAR(64) NOT NULL DEFAULT 'linux';

ALTER TABLE execution_jobs
    DROP CONSTRAINT IF EXISTS execution_jobs_script_slug_fkey;

ALTER TABLE execution_jobs
    ALTER COLUMN server_id DROP NOT NULL,
    ALTER COLUMN script_slug SET DEFAULT 'adhoc-command',
    ADD COLUMN IF NOT EXISTS server_name VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS server_host VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS execution_type VARCHAR(32) NOT NULL DEFAULT 'command',
    ADD COLUMN IF NOT EXISTS command_text TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS script_name VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS duration_ms BIGINT NOT NULL DEFAULT 0;

-- Seed production pre-configured scripts
INSERT INTO script_registry (slug, name, category, os_target, description, script_content, timeout_seconds, is_dangerous)
VALUES
(
    'system-telemetry',
    'System CPU, Memory & Disk Telemetry',
    'system',
    'linux',
    'Collects system uptime, load averages, RAM utilization, and filesystem disk usage.',
    E'#!/usr/bin/env bash\nset -e\necho "=== HOST & KERNEL ==="\nuname -a\nuptime\necho ""\necho "=== MEMORY UTILIZATION ==="\nfree -h 2>/dev/null || vm_stat\necho ""\necho "=== DISK SPACE ==="\ndf -hT 2>/dev/null || df -h',
    30,
    false
),
(
    'network-ip-audit',
    'Audit Network Interfaces & Secondary IPs',
    'network',
    'linux',
    'Lists all bound IPv4/IPv6 addresses, active NICs, default routes, and NetworkManager connections.',
    E'#!/usr/bin/env bash\necho "=== INTERFACES & BOUND IPS ==="\nip -brief addr show 2>/dev/null || ifconfig\necho ""\necho "=== ROUTING TABLE ==="\nip route show 2>/dev/null || netstat -rn | head -n 25\necho ""\necho "=== NMCLI PROFILES ==="\nnmcli device status 2>/dev/null || echo "nmcli not installed"',
    30,
    false
),
(
    'check-port25-smtp',
    'Verify Outbound Port 25 & SMTP Connectivity',
    'mta',
    'linux',
    'Tests outbound TCP connectivity on port 25 against major mail relays to detect ISP blocks.',
    E'#!/usr/bin/env bash\necho "=== TESTING OUTBOUND PORT 25 ==="\nif timeout 5 bash -c "cat < /dev/null > /dev/tcp/smtp.gmail.com/25" 2>/dev/null; then\n  echo "[PASS] Outbound Port 25 is OPEN (smtp.gmail.com:25 reachable)"\nelse\n  echo "[FAIL] Outbound Port 25 appears BLOCKED or filtered"\nfi\necho ""\necho "=== LOCAL LISTENING SMTP PORTS ==="\nss -tlnp | grep -E ":25|:587|:465" 2>/dev/null || netstat -an | grep -E "\\.25 |\\.587 "',
    25,
    false
),
(
    'postfix-queue-status',
    'Inspect Mail Queue & Active Deliveries',
    'mta',
    'linux',
    'Displays Postfix / PowerMTA queue summary, deferred message counts, and recent mail log lines.',
    E'#!/usr/bin/env bash\necho "=== MAIL QUEUE SUMMARY ==="\nif command -v postqueue >/dev/null 2>&1; then\n  postqueue -p | tail -n 25\nelif command -v pmta >/dev/null 2>&1; then\n  pmta show status\nelse\n  echo "No MTA binary (postqueue / pmta) detected on PATH"\nfi\necho ""\necho "=== RECENT MAIL LOGS ==="\ntail -n 20 /var/log/mail.log 2>/dev/null || tail -n 20 /var/log/maillog 2>/dev/null || echo "No /var/log/mail.log found"',
    30,
    false
),
(
    'flush-mail-queue',
    'Flush Deferred Mail Queue',
    'mta',
    'linux',
    'Forces immediate delivery attempt for all queued/deferred messages in Postfix or PowerMTA.',
    E'#!/usr/bin/env bash\nset -e\necho "=== FLUSHING MTA QUEUE ==="\nif command -v postqueue >/dev/null 2>&1; then\n  postqueue -f\n  echo "Postfix queue flushed successfully."\nelif command -v pmta >/dev/null 2>&1; then\n  pmta schedule --all\n  echo "PowerMTA queue scheduled successfully."\nelse\n  echo "MTA binary not installed."\nfi',
    45,
    true
),
(
    'rdns-ptr-check',
    'Verify Public IP & Reverse DNS (PTR)',
    'network',
    'linux',
    'Detects primary outbound public IPv4 address and verifies its reverse DNS PTR record.',
    E'#!/usr/bin/env bash\nPUB_IP=$(curl -s4 --max-time 5 ifconfig.me || curl -s4 --max-time 5 icanhazip.com || echo "127.0.0.1")\necho "Detected Public IPv4: $PUB_IP"\necho "=== REVERSE DNS (PTR) LOOKUP ==="\nhost "$PUB_IP" 2>/dev/null || dig -x "$PUB_IP" +short 2>/dev/null || nslookup "$PUB_IP" 2>/dev/null || echo "DNS lookup utilities not installed"',
    30,
    false
),
(
    'restart-mta-daemons',
    'Restart MTA & Proxy Daemons',
    'mta',
    'linux',
    'Gracefully restarts Postfix, OpenDKIM, Squid HTTP proxy, and Danted SOCKS5 services if present.',
    E'#!/usr/bin/env bash\nfor svc in postfix opendkim pmta squid danted; do\n  if systemctl list-unit-files | grep -q "^${svc}\\.service" 2>/dev/null; then\n    echo "Restarting $svc..."\n    systemctl restart "$svc" && echo "[OK] $svc restarted"\n  fi\ndone\necho "Daemon restart sequence completed."',
    60,
    true
),
(
    'security-ssh-audit',
    'Active SSH Sessions & Listening Ports Audit',
    'security',
    'linux',
    'Lists currently logged-in operators, recent SSH logins, and all exposed TCP/UDP listening sockets.',
    E'#!/usr/bin/env bash\necho "=== ACTIVE LOGGED-IN USERS ==="\nw\necho ""\necho "=== LISTENING NETWORK SOCKETS ==="\nss -tulnp 2>/dev/null || netstat -tuln | head -n 30\necho ""\necho "=== LAST 10 LOGINS ==="\nlast -n 10 2>/dev/null || true',
    30,
    false
)
ON CONFLICT (slug) DO NOTHING;
