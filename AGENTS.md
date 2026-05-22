# OpenSandbox AGENTS

Use this file as the root router for the monorepo. Prefer the nearest `AGENTS.md` in the directory tree for task-specific instructions.

## Repository Map

- `server/`: FastAPI lifecycle control plane, Docker/Kubernetes runtime integration, snapshot metadata, and server tests
- `components/execd/`: in-sandbox execution daemon
- `components/egress/`: per-sandbox network egress policy sidecar
- `components/ingress/`: ingress gateway and endpoint routing
- `components/internal/`: shared Go helpers used by runtime components
- `sdks/`: sandbox, code-interpreter, and MCP SDKs plus generated clients
- `specs/`: public OpenAPI contracts and examples
- `kubernetes/`: Kubernetes operator, CRDs, task-executor, Helm charts, and Kind e2e tests
- `cli/`: `osb` command-line client and bundled CLI skills
- `tests/`: cross-language end-to-end SDK tests
- `docs/`, `examples/`, `sandboxes/`, `oseps/`: documentation, samples, images/environments, and proposals

## Routing

- For `server/**`, or lifecycle server behavior, sandbox creation flow, or user-visible server config, read `server/AGENTS.md`.
- For `sdks/**`, or SDK generation, handwritten adapters, or cross-language SDK alignment, read `sdks/AGENTS.md`.
- For `specs/**`, or API contract, schema, or example changes, read `specs/AGENTS.md`.
- For `kubernetes/**`, or CRDs, controller behavior, task execution, Helm/Kustomize deployment, pool scheduling, pause/resume snapshots, or Kind e2e tests, read `kubernetes/AGENTS.md`.
- For cross-cutting changes spanning spec, server, and SDKs, start with `specs/AGENTS.md` and then read affected consumer guides.
- For runtime component changes under `components/**`, read the nearest `README.md` or `DEVELOPMENT.md`; keep component APIs aligned with `specs/` and SDK consumers.
- For CLI changes under `cli/**`, read `cli/README.md` and verify command help/output behavior alongside unit tests.
- For cross-language e2e tests under `tests/**`, read the language-local README and keep test assumptions aligned with current server and SDK behavior.
- For areas without a local `AGENTS.md`, use the nearest `README.md`, `DEVELOPMENT.md`, and CI workflow as the next source of truth.

## Working Principles

- Think before coding: state assumptions, surface ambiguity, and ask or push back when the request has conflicting interpretations.
- Simplicity first: implement the smallest solution that satisfies the request; avoid speculative features, one-off abstractions, and unnecessary configurability.
- Surgical changes: touch only files and lines needed for the task, match local style, and do not refactor or delete unrelated pre-existing code.
- Goal-driven execution: translate non-trivial work into verifiable success criteria, add or update focused tests when behavior changes, and loop until checks pass or blockers are clear.

## Guardrails

Always:

- Keep changes focused on the user request.
- Treat `specs/*` as public contract sources.
- Keep spec, implementation, SDKs, docs, examples, config, and CLI behavior aligned when user-visible behavior changes.
- When changing `specs/*`, also update or verify affected server, SDK, docs, and release outputs when practical.
- When changing CRDs or Kubernetes public behavior, update or verify generated manifests, Helm/Kustomize deployment output, server Kubernetes integration, and docs when practical.
- Prefer additive, backward-compatible changes for public interfaces.
- Regenerate derived outputs when the source-of-truth file changes.
- Update tests when behavior changes or bugs are fixed.
- Mention unrun or blocked verification in the final handoff.
- Prefer file-scoped or package-scoped checks before full-suite validation.

Ask first:

- Breaking public API, SDK, config, protocol, or CLI changes
- Breaking CRD, annotation, label, Helm values, or Kubernetes deployment changes
- Intentional drift between a public contract and its implementation
- User-visible config or behavior changes without a clear migration story

Never:

- Edit generated output as the only fix.
- Mix unrelated component work into the same change.

## Review Focus

- Prioritize breaking changes in specs, SDK interfaces, config, CLI behavior, and protocols.
- Flag protocol changes that are unnecessary, inconsistent, or hard to implement.
- Flag changes that break source-of-truth boundaries or intended layering.
- Call out missing tests and compatibility risks explicitly.

## AI Coding Job (`/v1/jobs`)

Async job that spins up a sandbox from a snapshot, runs an AI coding workflow, and destroys the sandbox on success (or pauses it on failure for human inspection).

### Trigger

```bash
curl -X POST http://127.0.0.1:8080/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_id": "<snapshot-id>",
    "repo_url": "https://<token>@github.com/org/repo.git",
    "repo_branch": "main",
    "provider": "qoder"
  }'
```

**Parameters:**

| Field | Required | Description |
|-------|----------|-------------|
| `snapshot_id` | yes | Snapshot to restore sandbox from (must be `Ready`) |
| `repo_url` | yes | Git repo URL with embedded auth token |
| `repo_branch` | yes | Branch to checkout |
| `provider` | yes | Access key provider to filter (e.g. `qoder`, `openai`) |

**Response:** `202 Accepted` with job ID. Query status via `GET /v1/jobs/{id}`.

### Internal Execution Steps

1. **creating_sandbox** — `POST /v1/sandboxes` with `snapshotId` + `resourceLimits`, poll until `Running`, then wait for execd daemon to be ready (ping)
2. **git_pull** — Execute `git clone <repo_url> /workspace && git checkout <branch>` via execd
3. **writing_keys** — Fetch access keys from DB (filtered by `provider`), write to `/workspace/.env.local` as `QODER_TOKEN01=xxx`, `QODER_TOKEN02=yyy`
4. **running_cli** — Execute target CLI command via execd (currently mocked as `echo 'mock cli done'`)
5. **git_push** — Read `/workspace/.env.local`, randomly pick one token, execute `QODER_ACCESS_KEY=<token> qodercli /commit && git push`
6. **destroying** — `DELETE /v1/sandboxes/{id}` → job status `Succeeded`

**On failure (steps 2-5):** sandbox is paused (`POST /v1/sandboxes/{id}/pause`), job status set to `Paused` with error details.

### Related Code

| File | Role |
|------|------|
| `server/opensandbox_server/api/jobs.py` | FastAPI router (POST trigger + GET status) |
| `server/opensandbox_server/services/job_runner.py` | Async workflow orchestration |
| `server/opensandbox_server/services/job_models.py` | `JobRecord` dataclass, `JobStatus`/`JobStep` enums |
| `server/opensandbox_server/services/job_repository.py` | `JobRepository` protocol |
| `server/opensandbox_server/repositories/jobs/sqlite.py` | SQLite persistence |
| `server/opensandbox_server/repositories/jobs/factory.py` | Repository factory |
| `server/tests/test_job_runner.py` | Runner unit tests |
| `server/tests/test_jobs_api.py` | API E2E tests |
| `server/tests/test_job_repository_sqlite.py` | Repository unit tests |
| `docs/specs/2026-05-22-ai-coding-job-design.md` | Full design spec |
