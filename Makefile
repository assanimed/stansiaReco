.PHONY: all build test lint run-api run-worker run-frontend docker-up docker-down clean

all: build test

# Build all Go binaries and Next.js frontend
build:
	@echo "==> Building Go backend..."
	cd backend && GOTOOLCHAIN=local go build -o bin/api ./cmd/api
	cd backend && GOTOOLCHAIN=local go build -o bin/worker ./cmd/worker
	@echo "==> Building Next.js frontend..."
	cd frontend && npm run build

# Run automated tests
test:
	@echo "==> Running backend tests..."
	cd backend && GOTOOLCHAIN=local go test -v ./...

# Run linters and checks
lint:
	@echo "==> Verifying Go code..."
	cd backend && GOTOOLCHAIN=local go vet ./...
	@echo "==> Type-checking frontend..."
	cd frontend && npx tsc --noEmit

# Local Development Services
run-api:
	cd backend && GOTOOLCHAIN=local go run ./cmd/api

run-worker:
	cd backend && GOTOOLCHAIN=local go run ./cmd/worker

run-frontend:
	cd frontend && npm run dev

# Docker Compose workflows
docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

clean:
	rm -rf backend/bin
	rm -rf frontend/.next
