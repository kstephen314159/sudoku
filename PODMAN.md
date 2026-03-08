# Running Sudoku API with Podman

This guide covers running the **API server** in a Podman container. The SPA runs natively on your host for fast development iteration.

**Why container the API but not the SPA?**
- API: Needs to run as a background service, good candidate for containerization
- SPA: Vite dev server is optimized for fast local development—containerizing adds overhead without benefit

## Prerequisites

- **Podman** 4.0+ installed on macOS

Install if needed:

```bash
# Using Homebrew on macOS
brew install podman
```

## Quick Start

### 1. Build the API container image (one-time)

```bash
cd /Users/zaphod/code/math/sudoku
podman build -f Dockerfile -t sudoku-api .
```

### 2. Run the API container (Terminal 1)

```bash
podman run --rm \
  -p 3001:3001 \
  -v $(pwd):/app \
  -v /app/node_modules \
  -e NODE_ENV=development \
  -e PORT=3001 \
  sudoku-api
```

The API server will start and display:

```
Sudoku API server running on http://localhost:3001
Health check: GET http://localhost:3001/health
```

### 3. Start the SPA (Terminal 2)

```bash
npm run dev
# Starts on http://localhost:3000
```

---

## What Each Flag Does

| Flag | Purpose |
|---|---|
| `--rm` | Remove container when it stops (cleanup) |
| `-p 3001:3001` | Expose port 3001 to host |
| `-v $(pwd):/app` | Mount current directory into container for live code changes |
| `-v /app/node_modules` | Keep node_modules in container (separate from host) |
| `-e NODE_ENV=development` | Set environment for dev mode |
| `-e PORT=3001` | API server port |

---

## Stopping the Container

Press `Ctrl+C` in Terminal 1 to stop the container (the `--rm` flag automatically cleans it up).

---

## Rebuilding the Image

If you change `package.json` or `Dockerfile`:

```bash
podman build -f Dockerfile -t sudoku-api .
```

Then re-run with the command from "Quick Start" step 2.

---

## Workflow

1. **Load a puzzle**
   - Open http://localhost:3000
   - Click "Load Puzzle"
   - Select `data/puzzle.json`

2. **Find next move**
   - Click "Find Next Move"
   - See suggested moves and highlights

3. **Apply move**
   - Click "Apply Move" button
   - Board updates via API call

4. **Repeat**
   - Click "Find Next Move" again

---

## API Endpoints (served on port 3001)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/puzzle/load` | Load puzzle JSON |
| `GET` | `/api/puzzle/current` | Get current board state |
| `POST` | `/api/solve/next` | Get suggested next move |
| `POST` | `/api/moves/apply` | Apply moves and persist |
| `GET` | `/api/puzzle/stats` | Get board statistics |
| `GET` | `/health` | Health check |

### Example queries from your host

```bash
# Load a puzzle
curl -X POST http://localhost:3001/api/puzzle/load \
  -H "Content-Type: application/json" \
  -d @data/puzzle.json

# Get next move
curl -X POST http://localhost:3001/api/solve/next

# Apply moves
curl -X POST http://localhost:3001/api/moves/apply \
  -H "Content-Type: application/json" \
  -d '{
    "moves": [
      {"cell":"R2C4","action":"remove_candidate","digit":4}
    ]
  }'

# Get stats
curl -X GET http://localhost:3001/api/puzzle/stats
```

---

## Troubleshooting

### Port already in use

```bash
# Find process using port 3001
lsof -i :3001

# Kill it
kill -9 <PID>
```

### Volume mount issues

Ensure Podman can access your home directory:

```bash
# Check mounts
podman machine inspect | grep -A 5 mounts

# If needed, manually mount inside the machine:
podman machine ssh
sudo mount -t virtiofs /Users /Users
```

### "Cannot find module" errors inside container

The `/app/node_modules` volume is separate from the host. If npm packages change:

```bash
# Rebuild without cache
podman build -f Dockerfile -t sudoku-api . --no-cache
```

### Viewing container logs

If you closed the terminal but want recent logs:

```bash
podman logs --last 50 sudoku-api
```

(Only works if you didn't use `--rm` flag)

---

## Advanced: Run without --rm (for debugging)

If you want to keep the container around to inspect:

```bash
podman run -d \
  --name sudoku-api \
  -p 3001:3001 \
  -v $(pwd):/app \
  -e NODE_ENV=development \
  sudoku-api
```

Then:

```bash
# View logs
podman logs -f sudoku-api

# Stop
podman stop sudoku-api

# Remove
podman rm sudoku-api
```

---

## Next Steps: Deploying to AWS Lambda

Once you're ready to deploy:

1. Tag the image: `podman tag sudoku-api:latest <your-registry>/sudoku-api:latest`
2. Push to registry (Docker Hub, GitHub Packages, or ECR)
3. Create Lambda function from container image
4. Use API Gateway for HTTPS routing
5. Deploy SPA to CloudFront + S3

See `LAMBDA_DEPLOYMENT.md` (coming soon) for step-by-step instructions.


