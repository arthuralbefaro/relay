# Runbook

Local operations for Relay, plus the failures we actually hit while building it.

## Ports

| Port | Service |
| --- | --- |
| 3000 | web editor |
| 3001 | API |
| 5080 | C# node host |
| 5433 | Postgres, mapped from the container's 5432 |
| 6379 | Redis |

## Starting and stopping

```bash
pnpm stack     
pnpm stack:migrate  
pnpm stack:logs    
pnpm stack:down   
```

The `pgdata` volume survives `stack:down`. To discard the database entirely:

```bash
docker compose --profile full down -v
```

## Applying migrations

Inside Docker: `pnpm stack:migrate`. From the host, against the same database: `pnpm migrate`.
The command is idempotent and prints either the ids it applied or `nenhuma migration pendente`.

The API and the worker refuse to start while a migration is pending and name the command in the
error. That is intentional. Never add an automatic migration on boot: several replicas starting
together would race on the same DDL.

## Failure modes

### Port is already allocated

`Bind for 0.0.0.0:5433 failed: port is already allocated` means another container or a local
Postgres holds the port. Find it:

```bash
docker ps -a --filter "publish=5433"
```

Stop the other container, or move Relay to a free port. Moving requires four edits: the host side
of `ports` in `docker-compose.yml`, `DATABASE_URL` in `.env` and in `.env.example`, and both the
port mapping and `DATABASE_URL` in the `integration` job of `.github/workflows/ci.yml`. Services
inside Docker always talk to `postgres:5432` and are unaffected.

### pnpm refuses an ignored build script

pnpm 11 treats a blocked install script as an error. Decide per package in `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  esbuild: true
  msgpackr-extract: false
```

`true` when the package needs its script to work at all, as esbuild does for its platform binary.
`false` for optional native accelerators that have a JavaScript fallback.

### DATABASE_URL não definida

The root `.env` is missing. `cp .env.example .env`. The file is git-ignored on purpose; the example
is the versioned copy.

### Cannot find package 'tsx' inside the container

A dependency reached the container's `pnpm install --frozen-lockfile` without being in the
lockfile. Install it on the host, then rebuild:

```bash
pnpm --filter @relay/api add -D tsx
docker compose --profile full --profile tools build api worker migrate
```

The image build runs a smoke import of the runtime dependencies so this fails during the build
rather than at container start.

### dotnet.js not found

The web build copies the published WebAssembly output into `public/`. Run `pnpm dotnet`. If the
script reports a missing `dotnet.js`, it prints the directory listing it did find: the publish
layout changes between SDK releases, and the copy script is the thing to adjust.

### The demo works locally and 404s on GitHub Pages

The published site lives under `/relay`, and the runtime files are fetched by URL. Open the network
tab and check which request failed; it is almost always a missing base path prefix.

### A second tab will not open the browser build

Expected. PGlite owns its IndexedDB store exclusively, so the app holds a Web Lock for the life of
the tab and refuses the second one. Close the first tab and reload.

### AI nodes fail with llm_indisponivel

No provider is configured. In the browser, paste a key into the left panel; without one, the nodes
answer from recorded text rather than failing, so this code means the server side. Set
`ANTHROPIC_API_KEY` in the root `.env` and restart the stack:

```bash
docker compose --profile full up -d worker
```

The worker prints its provider at startup, so `docker compose --profile full logs worker | head`
answers whether it picked up the key.

### AI nodes fail with chave_invalida or resposta_nao_estruturada

`chave_invalida` means the provider rejected the credential, and the node fails on the first
attempt because retrying would not help. Check the key, and note that keys are redacted from
execution logs, so the log will not show which one was used.

`resposta_nao_estruturada` means the model answered without a parseable JSON object. The raw text
is not stored. If it recurs for a given input, the instruction in the node's config is usually the
thing to tighten.

### The queue is stuck

Check that the worker is alive and connected:

```bash
docker compose --profile full logs worker | tail -n 30
curl http://localhost:3001/health
```

`/health` pings Postgres and Redis and answers `503` when either is unreachable. A job that fails
three times stays in the failed set and `GET /executions/:id` reports `falhou_na_infra` with the
reason.

## Rolling back

There is no down migration. To undo a schema change locally, drop the volume and migrate again.
Before that is acceptable in a deployed environment, each migration needs a paired reversal, which
is not built yet.

## Measuring

```bash
pnpm measure
pnpm bench                         
BENCH_TOTAL=200 BENCH_PARALLEL=20 pnpm bench
```

`bench` creates a flow named `bench`, runs one warm-up execution so the first measurement does not
include the node host's cold start, then measures.