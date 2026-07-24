# OpsForge

A hands-on DevOps portfolio project: a minimal Fastify API, containerized, tested and scanned in CI, deployed to a real Kubernetes cluster on a cloud VM, and continuously synced with GitOps (ArgoCD).

The application itself is intentionally simple — the real point of this project is everything *around* it: the pipeline, the infrastructure, and the deployment automation.

---

## Architecture

```
Developer
   │  git push
   ▼
GitHub Actions (CI)
   │  lint → test → build (TypeScript) → security audit (npm audit)
   │  build multi-arch Docker image (amd64 + arm64)
   │  push image to Docker Hub, tagged with the commit SHA
   ▼
Docker Hub (image registry)
   │
   ▼
ArgoCD (GitOps controller, running inside the cluster)
   │  watches infra/k8s/ on GitHub
   │  auto-syncs any change — no manual kubectl needed
   ▼
Kubernetes (k3s) — Oracle Cloud VM (ARM / aarch64)
   ├── opsforge-api Deployment (3 replicas)
   ├── opsforge-api-service (NodePort)
   ├── postgres Deployment (1 replica, PersistentVolumeClaim)
   └── postgres-service (ClusterIP)
```

---

## Tech stack

| Category            | Tool(s)                                             |
|----------------------|------------------------------------------------------|
| App runtime           | Node.js, TypeScript, Fastify                         |
| Local dev             | Docker, Docker Compose (API + Postgres + Redis)      |
| CI                    | GitHub Actions (lint, test, build, `npm audit`)      |
| Container registry     | Docker Hub (multi-arch: `linux/amd64`, `linux/arm64`) |
| Orchestration          | Kubernetes (k3s), running on an Oracle Cloud VM (ARM) |
| GitOps / CD            | ArgoCD                                                |
| Secrets                | Kubernetes Secrets (DB credentials, connection string) |
| Commit conventions      | Conventional Commits, enforced via Husky + Commitlint |

---

## Repository structure

```
opsforge/
├── apps/
│   └── api/
│       ├── src/
│       │   ├── app.ts        # Fastify app definition (routes)
│       │   ├── app.test.ts   # Vitest test for /health
│       │   └── index.ts      # Server entrypoint (starts the app)
│       └── Dockerfile        # Multi-stage build (builder + runner)
├── infra/
│   └── k8s/
│       ├── deployment.yaml   # API Deployment (3 replicas)
│       ├── service.yaml      # API Service (NodePort)
│       └── postgres.yaml     # Postgres Deployment + PVC + Service
├── docs/
│   └── git-strategy.md       # Branching model
├── .github/
│   └── workflows/
│       └── ci.yml            # CI pipeline
├── docker-compose.yml         # Local dev stack (API + Postgres + Redis)
├── docker-compose.override.yml
└── README.md
```

---

## Application endpoints

| Route      | Purpose                                                        |
|------------|------------------------------------------------------------------|
| `GET /health` | Liveness check — confirms the process is up.                   |
| `GET /ready`  | Readiness check — opens a real connection to Postgres and runs `SELECT 1`. Returns `200 {"status":"ready"}` on success, `503` if the database is unreachable. |

---

## CI pipeline (`.github/workflows/ci.yml`)

On every push/PR to `main`:

1. **Checkout** the repository
2. **Install** dependencies (`npm ci`)
3. **Lint** (`eslint`)
4. **Test** (`vitest`, using Fastify's `.inject()` — no real network calls)
5. **Build** (`tsc`)
6. **Security audit** (`npm audit --audit-level=high`) — blocks the pipeline on any high/critical vulnerability
7. **Build & push a multi-arch Docker image** (`linux/amd64` + `linux/arm64`, via Buildx + QEMU) to Docker Hub, tagged with the full commit SHA
8. Layers are cached between runs (`cache-from`/`cache-to: type=gha`) to keep multi-arch build times reasonable

> Multi-arch builds were required because the production cluster runs on an ARM (Oracle Ampere `A1.Flex`) VM, while local development happens on amd64 (Windows/Docker Desktop).

---

## Kubernetes setup

- **API**: `Deployment` with 3 replicas, exposed via a `NodePort` `Service`.
- **Postgres**: `Deployment` with 1 replica (intentionally never scaled — a single Postgres instance shouldn't run as multiple uncoordinated replicas), backed by a `PersistentVolumeClaim` so data survives Pod restarts.
- **Secrets**: the database password and the API's `DATABASE_URL` are stored as Kubernetes `Secret` objects (`postgres-secret`, `api-secret`) and injected via `secretKeyRef` — never committed to git in plaintext.
- Local development/testing of the manifests was first done against a disposable [Kind](https://kind.sigs.k8s.io/) cluster before moving to the real cloud VM.

---

## GitOps with ArgoCD

ArgoCD runs inside the same cluster and watches the `infra/k8s/` path of this repository (branch `main`). Sync policy is automatic with self-heal enabled, meaning:

- Any change committed to `infra/k8s/*.yaml` is automatically applied to the cluster within ArgoCD's polling interval — no manual `kubectl apply` required.
- Any manual, out-of-band change made directly to the cluster (e.g. via `kubectl edit`) is automatically reverted back to match what's defined in git.

This closes the loop between **CI** (build and publish an image) and **CD** (actually run that image) — the only two things a developer needs to do are write code and commit configuration changes; everything else is automatic.

---

## Local development

```bash
git clone https://github.com/MouadModnibi/OpsForge.git
cd OpsForge
npm install
docker compose up --build
```

- API available at `http://localhost:3000`
- `GET /health` and `GET /ready` should both return `200`

Run tests and lint locally before pushing:
```bash
npm run lint
npm test
```

---

## What this project demonstrates

- Multi-stage Docker builds (small, non-root-ready runtime images)
- A real CI pipeline: lint → test → build → security scan → publish
- Multi-architecture image builds (amd64 + arm64) to support heterogeneous infrastructure
- Kubernetes fundamentals: Deployments, Services (ClusterIP & NodePort), Secrets, PersistentVolumeClaims
- Deploying and operating a real cluster on cloud infrastructure (Oracle Cloud, ARM)
- GitOps: using git as the single source of truth for cluster state, via ArgoCD

## Possible next steps

- Infrastructure as Code (Terraform) for provisioning the VM itself
- Ingress + a real domain, replacing the current NodePort setup
- Observability stack (Prometheus, Grafana) for metrics and dashboards
- Helm chart to package the raw manifests for reuse across environments

---

## Author

Built by [Mouad Modnibi](https://github.com/MouadModnibi) as a self-directed DevOps learning project.
