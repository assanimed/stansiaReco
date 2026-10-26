package execution

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
)

const wsGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

// ActiveTerminalSession holds either a live SSH PTY session or a local interactive shell
type ActiveTerminalSession struct {
	mu           sync.Mutex
	Info         TerminalSessionInfo
	sshClient    *ssh.Client
	sshSession   *ssh.Session
	stdinWriter  io.WriteCloser
	localCwd     string
	outputBuffer []byte
	subscribers  map[chan []byte]struct{}
	closed       bool
}

func (ts *ActiveTerminalSession) appendOutput(data []byte) {
	if len(data) == 0 {
		return
	}
	ts.mu.Lock()
	defer ts.mu.Unlock()

	ts.outputBuffer = append(ts.outputBuffer, data...)
	// Cap buffer at 512KB
	if len(ts.outputBuffer) > 524288 {
		ts.outputBuffer = ts.outputBuffer[len(ts.outputBuffer)-524288:]
	}
	ts.Info.BytesRead += int64(len(data))
	ts.Info.LastActiveAt = time.Now().UTC()

	for ch := range ts.subscribers {
		select {
		case ch <- append([]byte(nil), data...):
		default:
		}
	}
}

func (ts *ActiveTerminalSession) subscribe() (chan []byte, []byte) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ch := make(chan []byte, 64)
	ts.subscribers[ch] = struct{}{}
	history := append([]byte(nil), ts.outputBuffer...)
	return ch, history
}

func (ts *ActiveTerminalSession) unsubscribe(ch chan []byte) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	delete(ts.subscribers, ch)
	close(ch)
}

func (ts *ActiveTerminalSession) Close() {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	if ts.closed {
		return
	}
	ts.closed = true
	ts.Info.Status = "closed"
	if ts.stdinWriter != nil {
		_ = ts.stdinWriter.Close()
	}
	if ts.sshSession != nil {
		_ = ts.sshSession.Close()
	}
	if ts.sshClient != nil {
		_ = ts.sshClient.Close()
	}
}

// CreateTerminalSession initializes a live SSH PTY or local diagnostic TTY session
func (s *PostgresExecutionService) CreateTerminalSession(
	ctx context.Context,
	req CreateTerminalSessionRequest,
	userID uuid.UUID,
) (*TerminalSessionInfo, error) {
	cols := req.Cols
	if cols <= 0 {
		cols = 120
	}
	rows := req.Rows
	if rows <= 0 {
		rows = 34
	}

	sessionID := uuid.New().String()
	now := time.Now().UTC()

	// Case 1: Localhost Control Plane Interactive Shell
	if req.IsLocal || req.ServerID == nil {
		cwd, err := os.Getwd()
		if err != nil {
			cwd = "/tmp"
		}
		hostname, _ := os.Hostname()
		if hostname == "" {
			hostname = "control-plane"
		}

		active := &ActiveTerminalSession{
			Info: TerminalSessionInfo{
				SessionID:    sessionID,
				ServerName:   "Control Plane Local TTY",
				ServerHost:   "127.0.0.1 (" + hostname + ")",
				Username:     os.Getenv("USER"),
				IsLocal:      true,
				Cols:         cols,
				Rows:         rows,
				Status:       "connected",
				CreatedAt:    now,
				LastActiveAt: now,
			},
			localCwd:    cwd,
			subscribers: make(map[chan []byte]struct{}),
		}
		if active.Info.Username == "" {
			active.Info.Username = "operator"
		}

		banner := fmt.Sprintf(
			"\x1b[1;34m╔══════════════════════════════════════════════════════════════════════════╗\x1b[0m\r\n"+
				"\x1b[1;34m║\x1b[0m  \x1b[1;32mStansiaReco Live Interactive TTY\x1b[0m — \x1b[1;36m%s\x1b[0m (%dx%d)          \x1b[1;34m║\x1b[0m\r\n"+
				"\x1b[1;34m║\x1b[0m  Session ID: \x1b[33m%s\x1b[0m                            \x1b[1;34m║\x1b[0m\r\n"+
				"\x1b[1;34m╚══════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n"+
				"\x1b[90mConnected to %s as %s. Type commands below (e.g. uname -a, ls -la, ip a, df -h).\x1b[0m\r\n\r\n"+
				"\x1b[1;32m%s@%s\x1b[0m:\x1b[1;34m%s\x1b[0m$ ",
			active.Info.ServerName, cols, rows, sessionID, active.Info.ServerHost, active.Info.Username,
			active.Info.Username, hostname, filepath.Base(cwd),
		)
		active.appendOutput([]byte(banner))

		s.termMu.Lock()
		s.terminals[sessionID] = active
		s.termMu.Unlock()

		return &active.Info, nil
	}

	// Case 2: Remote MTA Server SSH PTY
	srv, sshClient, username, err := s.dialSSHServer(ctx, *req.ServerID)
	if err != nil {
		return nil, err
	}

	sshSession, err := sshClient.NewSession()
	if err != nil {
		_ = sshClient.Close()
		return nil, fmt.Errorf("failed to open SSH session: %w", err)
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.ICRNL:         1,
		ssh.IXON:          1,
		ssh.IXANY:         1,
		ssh.OPOST:         1,
		ssh.ONLCR:         1,
		ssh.ISIG:          1,
		ssh.ICANON:        1,
		ssh.IEXTEN:        1,
		ssh.ECHOE:         1,
		ssh.ECHOK:         1,
		ssh.ECHOCTL:       1,
		ssh.ECHOKE:        1,
		ssh.TTY_OP_ISPEED: 38400,
		ssh.TTY_OP_OSPEED: 38400,
	}

	if err := sshSession.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		_ = sshSession.Close()
		_ = sshClient.Close()
		return nil, fmt.Errorf("failed to request SSH PTY (xterm-256color): %w", err)
	}

	stdinPipe, err := sshSession.StdinPipe()
	if err != nil {
		_ = sshSession.Close()
		_ = sshClient.Close()
		return nil, fmt.Errorf("failed to attach SSH stdin pipe: %w", err)
	}

	stdoutPipe, err := sshSession.StdoutPipe()
	if err != nil {
		_ = sshSession.Close()
		_ = sshClient.Close()
		return nil, fmt.Errorf("failed to attach SSH stdout pipe: %w", err)
	}

	stderrPipe, err := sshSession.StderrPipe()
	if err != nil {
		_ = sshSession.Close()
		_ = sshClient.Close()
		return nil, fmt.Errorf("failed to attach SSH stderr pipe: %w", err)
	}

	if err := sshSession.Shell(); err != nil {
		_ = sshSession.Close()
		_ = sshClient.Close()
		return nil, fmt.Errorf("failed to start interactive shell on remote server: %w", err)
	}

	active := &ActiveTerminalSession{
		Info: TerminalSessionInfo{
			SessionID:    sessionID,
			ServerID:     &srv.ID,
			ServerName:   srv.Name,
			ServerHost:   fmt.Sprintf("%s:%d", srv.HostnameOrIP, srv.SSHPort),
			Username:     username,
			IsLocal:      false,
			Cols:         cols,
			Rows:         rows,
			Status:       "connected",
			CreatedAt:    now,
			LastActiveAt: now,
		},
		sshClient:   sshClient,
		sshSession:  sshSession,
		stdinWriter: stdinPipe,
		subscribers: make(map[chan []byte]struct{}),
	}

	banner := fmt.Sprintf(
		"\x1b[1;32m● SSH PTY Connected:\x1b[0m \x1b[1;36m%s\x1b[0m (%s@%s:%d) [xterm-256color %dx%d]\r\n",
		srv.Name, username, srv.HostnameOrIP, srv.SSHPort, cols, rows,
	)
	active.appendOutput([]byte(banner))

	// Stream stdout & stderr into session buffer
	pumpStream := func(r io.Reader) {
		buf := make([]byte, 4096)
		for {
			n, err := r.Read(buf)
			if n > 0 {
				active.appendOutput(buf[:n])
			}
			if err != nil {
				break
			}
		}
	}
	go pumpStream(stdoutPipe)
	go pumpStream(stderrPipe)

	go func() {
		_ = sshSession.Wait()
		active.appendOutput([]byte("\r\n\x1b[1;31m[SSH PTY session terminated by remote host]\x1b[0m\r\n"))
		active.Close()
	}()

	s.termMu.Lock()
	s.terminals[sessionID] = active
	s.termMu.Unlock()

	return &active.Info, nil
}

func (s *PostgresExecutionService) ListTerminalSessions() []TerminalSessionInfo {
	s.termMu.RLock()
	defer s.termMu.RUnlock()

	list := make([]TerminalSessionInfo, 0, len(s.terminals))
	for _, ts := range s.terminals {
		ts.mu.Lock()
		list = append(list, ts.Info)
		ts.mu.Unlock()
	}
	return list
}

func (s *PostgresExecutionService) WriteTerminalInput(sessionID string, input string) error {
	s.termMu.RLock()
	ts, ok := s.terminals[sessionID]
	s.termMu.RUnlock()
	if !ok {
		return ErrSessionNotFound
	}

	ts.mu.Lock()
	if ts.closed {
		ts.mu.Unlock()
		return errors.New("terminal session is closed")
	}
	ts.Info.BytesWritten += int64(len(input))
	ts.Info.LastActiveAt = time.Now().UTC()
	isLocal := ts.Info.IsLocal
	stdin := ts.stdinWriter
	ts.mu.Unlock()

	if !isLocal && stdin != nil {
		_, err := stdin.Write([]byte(input))
		return err
	}

	// Local interactive command execution
	return s.executeLocalTerminalLine(ts, input)
}

func (s *PostgresExecutionService) executeLocalTerminalLine(ts *ActiveTerminalSession, rawInput string) error {
	// Handle Ctrl+C
	if rawInput == "\x03" {
		hostname, _ := os.Hostname()
		ts.mu.Lock()
		cwd := ts.localCwd
		user := ts.Info.Username
		ts.mu.Unlock()
		ts.appendOutput([]byte("^C\r\n" + fmt.Sprintf("\x1b[1;32m%s@%s\x1b[0m:\x1b[1;34m%s\x1b[0m$ ", user, hostname, filepath.Base(cwd))))
		return nil
	}

	cmdLine := strings.TrimSpace(rawInput)
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "control-plane"
	}

	ts.mu.Lock()
	cwd := ts.localCwd
	user := ts.Info.Username
	ts.mu.Unlock()

	// Echo the command line
	ts.appendOutput([]byte(cmdLine + "\r\n"))

	if cmdLine == "" {
		prompt := fmt.Sprintf("\x1b[1;32m%s@%s\x1b[0m:\x1b[1;34m%s\x1b[0m$ ", user, hostname, filepath.Base(cwd))
		ts.appendOutput([]byte(prompt))
		return nil
	}

	if cmdLine == "clear" || cmdLine == "cls" {
		prompt := fmt.Sprintf("\x1b[2J\x1b[H\x1b[1;32m%s@%s\x1b[0m:\x1b[1;34m%s\x1b[0m$ ", user, hostname, filepath.Base(cwd))
		ts.appendOutput([]byte(prompt))
		return nil
	}

	// Built-in cd support to preserve working directory across commands
	if cmdLine == "cd" || strings.HasPrefix(cmdLine, "cd ") {
		targetDir := strings.TrimSpace(strings.TrimPrefix(cmdLine, "cd"))
		if targetDir == "" || targetDir == "~" {
			targetDir, _ = os.UserHomeDir()
		} else if !filepath.IsAbs(targetDir) {
			targetDir = filepath.Join(cwd, targetDir)
		}
		info, err := os.Stat(targetDir)
		if err != nil || !info.IsDir() {
			ts.appendOutput([]byte(fmt.Sprintf("\x1b[31mbash: cd: %s: No such file or directory\x1b[0m\r\n", targetDir)))
		} else {
			ts.mu.Lock()
			ts.localCwd = filepath.Clean(targetDir)
			cwd = ts.localCwd
			ts.mu.Unlock()
		}
		prompt := fmt.Sprintf("\x1b[1;32m%s@%s\x1b[0m:\x1b[1;34m%s\x1b[0m$ ", user, hostname, filepath.Base(cwd))
		ts.appendOutput([]byte(prompt))
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "bash", "-c", cmdLine)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "CLICOLOR_FORCE=1")

	var outBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &outBuf

	err := cmd.Run()
	rawOut := outBuf.String()
	// Normalize \n to \r\n for terminal display
	normalized := strings.ReplaceAll(rawOut, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\n", "\r\n")
	if normalized != "" {
		ts.appendOutput([]byte(normalized))
		if !strings.HasSuffix(normalized, "\r\n") {
			ts.appendOutput([]byte("\r\n"))
		}
	}
	if err != nil && rawOut == "" {
		ts.appendOutput([]byte(fmt.Sprintf("\x1b[31m%v\x1b[0m\r\n", err)))
	}

	prompt := fmt.Sprintf("\x1b[1;32m%s@%s\x1b[0m:\x1b[1;34m%s\x1b[0m$ ", user, hostname, filepath.Base(cwd))
	ts.appendOutput([]byte(prompt))
	return nil
}

func (s *PostgresExecutionService) ReadTerminalOutput(sessionID string, offset int) (*TerminalOutputChunk, error) {
	s.termMu.RLock()
	ts, ok := s.terminals[sessionID]
	s.termMu.RUnlock()
	if !ok {
		return nil, ErrSessionNotFound
	}

	ts.mu.Lock()
	defer ts.mu.Unlock()

	if offset < 0 || offset > len(ts.outputBuffer) {
		offset = 0
	}

	data := string(ts.outputBuffer[offset:])
	return &TerminalOutputChunk{
		SessionID:  sessionID,
		Data:       data,
		NextOffset: len(ts.outputBuffer),
		Status:     ts.Info.Status,
	}, nil
}

func (s *PostgresExecutionService) ResizeTerminal(sessionID string, cols, rows int) error {
	s.termMu.RLock()
	ts, ok := s.terminals[sessionID]
	s.termMu.RUnlock()
	if !ok {
		return ErrSessionNotFound
	}

	ts.mu.Lock()
	defer ts.mu.Unlock()

	if cols > 0 {
		ts.Info.Cols = cols
	}
	if rows > 0 {
		ts.Info.Rows = rows
	}

	if ts.sshSession != nil && !ts.closed {
		return ts.sshSession.WindowChange(ts.Info.Rows, ts.Info.Cols)
	}
	return nil
}

func (s *PostgresExecutionService) CloseTerminalSession(sessionID string) error {
	s.termMu.Lock()
	ts, ok := s.terminals[sessionID]
	if ok {
		delete(s.terminals, sessionID)
	}
	s.termMu.Unlock()

	if !ok {
		return ErrSessionNotFound
	}
	ts.Close()
	return nil
}

// ServeTerminalWebSocket upgrades the HTTP connection to RFC 6455 WebSocket and bridges I/O to the SSH PTY
func (s *PostgresExecutionService) ServeTerminalWebSocket(w http.ResponseWriter, r *http.Request, sessionID string) {
	s.termMu.RLock()
	ts, ok := s.terminals[sessionID]
	s.termMu.RUnlock()
	if !ok {
		http.Error(w, "Terminal session not found", http.StatusNotFound)
		return
	}

	wsKey := r.Header.Get("Sec-WebSocket-Key")
	if wsKey == "" {
		http.Error(w, "Missing Sec-WebSocket-Key", http.StatusBadRequest)
		return
	}

	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "WebSocket hijacking not supported", http.StatusInternalServerError)
		return
	}

	conn, rw, err := hj.Hijack()
	if err != nil {
		return
	}
	defer conn.Close()

	// Compute Sec-WebSocket-Accept
	h := sha1.New()
	_, _ = io.WriteString(h, wsKey+wsGUID)
	acceptKey := base64.StdEncoding.EncodeToString(h.Sum(nil))

	response := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n"
	if _, err := rw.WriteString(response); err != nil {
		return
	}
	if err := rw.Flush(); err != nil {
		return
	}

	subCh, history := ts.subscribe()
	defer ts.unsubscribe(subCh)

	writeMu := sync.Mutex{}
	sendWSFrame := func(payload []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return writeWebSocketTextFrame(conn, payload)
	}

	if len(history) > 0 {
		_ = sendWSFrame(history)
	}

	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-done:
				return
			case chunk, ok := <-subCh:
				if !ok {
					return
				}
				if err := sendWSFrame(chunk); err != nil {
					return
				}
			}
		}
	}()

	// Read frames from browser
	for {
		opcode, payload, err := readWebSocketFrame(rw.Reader)
		if err != nil || opcode == 8 { // Close frame
			close(done)
			return
		}
		if opcode == 9 { // Ping -> Pong
			writeMu.Lock()
			_ = writeWebSocketControlFrame(conn, 10, payload)
			writeMu.Unlock()
			continue
		}
		if opcode == 1 || opcode == 2 {
			// Check if JSON control message or raw input
			var msg struct {
				Type string `json:"type"`
				Data string `json:"data"`
				Cols int    `json:"cols"`
				Rows int    `json:"rows"`
			}
			if err := json.Unmarshal(payload, &msg); err == nil && msg.Type != "" {
				switch msg.Type {
				case "input":
					_ = s.WriteTerminalInput(sessionID, msg.Data)
				case "resize":
					_ = s.ResizeTerminal(sessionID, msg.Cols, msg.Rows)
				}
			} else {
				_ = s.WriteTerminalInput(sessionID, string(payload))
			}
		}
	}
}

func writeWebSocketTextFrame(w io.Writer, payload []byte) error {
	var header []byte
	length := len(payload)
	if length < 126 {
		header = []byte{0x81, byte(length)}
	} else if length <= 65535 {
		header = []byte{0x81, 126, byte(length >> 8), byte(length & 0xff)}
	} else {
		header = make([]byte, 10)
		header[0] = 0x81
		header[1] = 127
		binary.BigEndian.PutUint64(header[2:], uint64(length))
	}
	if _, err := w.Write(header); err != nil {
		return err
	}
	_, err := w.Write(payload)
	return err
}

func writeWebSocketControlFrame(w io.Writer, opcode byte, payload []byte) error {
	header := []byte{0x80 | opcode, byte(len(payload))}
	if _, err := w.Write(header); err != nil {
		return err
	}
	_, err := w.Write(payload)
	return err
}

func readWebSocketFrame(r *bufio.Reader) (byte, []byte, error) {
	b0, err := r.ReadByte()
	if err != nil {
		return 0, nil, err
	}
	b1, err := r.ReadByte()
	if err != nil {
		return 0, nil, err
	}

	opcode := b0 & 0x0f
	masked := (b1 & 0x80) != 0
	length := int64(b1 & 0x7f)

	if length == 126 {
		var ext uint16
		if err := binary.Read(r, binary.BigEndian, &ext); err != nil {
			return 0, nil, err
		}
		length = int64(ext)
	} else if length == 127 {
		var ext uint64
		if err := binary.Read(r, binary.BigEndian, &ext); err != nil {
			return 0, nil, err
		}
		length = int64(ext)
	}

	var maskKey [4]byte
	if masked {
		if _, err := io.ReadFull(r, maskKey[:]); err != nil {
			return 0, nil, err
		}
	}

	if length > 1048576 {
		return 0, nil, fmt.Errorf("frame too large")
	}

	payload := make([]byte, length)
	if _, err := io.ReadFull(r, payload); err != nil {
		return 0, nil, err
	}

	if masked {
		for i := range payload {
			payload[i] ^= maskKey[i%4]
		}
	}

	return opcode, payload, nil
}

// Helper to dial an MTA server via SSH using stored credentials in Vault
type dialTargetServer struct {
	ID           uuid.UUID
	Name         string
	HostnameOrIP string
	SSHPort      int
	CredentialID *uuid.UUID
}

func (s *PostgresExecutionService) dialSSHServer(ctx context.Context, serverID uuid.UUID) (*dialTargetServer, *ssh.Client, string, error) {
	var srv dialTargetServer
	err := s.db.QueryRow(ctx, `
		SELECT id, name, hostname_or_ip, ssh_port, credential_id
		FROM servers
		WHERE id = $1
	`, serverID).Scan(&srv.ID, &srv.Name, &srv.HostnameOrIP, &srv.SSHPort, &srv.CredentialID)
	if err != nil {
		return nil, nil, "", fmt.Errorf("server not found: %w", err)
	}

	if srv.CredentialID == nil {
		return nil, nil, "", fmt.Errorf("server %s has no attached SSH credentials", srv.Name)
	}

	var credType string
	var username string
	var encryptedSecret []byte
	err = s.db.QueryRow(ctx, `
		SELECT cred_type, username, encrypted_secret
		FROM credentials
		WHERE id = $1
	`, *srv.CredentialID).Scan(&credType, &username, &encryptedSecret)
	if err != nil {
		return nil, nil, "", fmt.Errorf("failed to load server SSH credential: %w", err)
	}

	decrypted, err := s.vault.Decrypt(encryptedSecret)
	if err != nil {
		return nil, nil, "", fmt.Errorf("failed to decrypt SSH credential secret: %w", err)
	}

	var authMethods []ssh.AuthMethod
	switch credType {
	case "password":
		authMethods = append(authMethods, ssh.Password(string(decrypted)))
	case "private_key":
		signer, err := ssh.ParsePrivateKey(decrypted)
		if err != nil {
			return nil, nil, "", fmt.Errorf("failed to parse SSH private key: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	case "private_key_passphrase":
		parts := strings.SplitN(string(decrypted), "\x00", 2)
		var passBytes []byte
		if len(parts) > 1 {
			passBytes = []byte(parts[1])
		}
		signer, err := ssh.ParsePrivateKeyWithPassphrase([]byte(parts[0]), passBytes)
		if err != nil {
			return nil, nil, "", fmt.Errorf("failed to parse encrypted SSH private key: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	default:
		authMethods = append(authMethods, ssh.Password(string(decrypted)))
	}

	sshConfig := &ssh.ClientConfig{
		User:            username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         8 * time.Second,
	}

	targetAddr := net.JoinHostPort(srv.HostnameOrIP, strconv.Itoa(srv.SSHPort))
	client, err := ssh.Dial("tcp", targetAddr, sshConfig)
	if err != nil {
		return nil, nil, "", fmt.Errorf("SSH dial to %s (%s) failed: %w", srv.Name, targetAddr, err)
	}

	return &srv, client, username, nil
}
