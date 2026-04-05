# FinSpark | Enterprise Feature Intelligence Platform

A polished monorepo for enterprise-grade product analytics, feature intelligence, and execution automation.

FinSpark detects user-facing features from APKs and websites, instruments event tracking on web and mobile, builds session-level analytics, predicts churn, recommends prioritized actions, and routes work to execution tools like Asana and Power BI.

---

## 🚀 Why FinSpark Exists
Enterprise teams often understand that users are dropping off, but they do not know which feature caused it, why it happened, or how to turn that insight into action fast enough.

FinSpark closes that loop with:
- feature-level usage discovery
- session and path analytics
- churn and friction risk prediction
- prioritized product recommendations
- action automation into execution tools

---

## 🌟 Key Capabilities

### Product Intelligence
- APK and website feature detection
- Tracking SDKs for web and Android
- Session reconstruction and event ingestion
- Multi-tenant analytics for enterprise customers

### Machine Intelligence
- BiLSTM churn prediction for session-level risk
- Markov path modeling for transition probability and funnel integrity
- Ensemble scoring layer combining multiple models
- RAG-backed attribution for friction explanations

### Execution & Integrations
- Asana integration for task creation and backlog handoff
- Power BI export for enterprise reporting and dashboarding
- CSV/JSON pipeline support for export and analysis

### Glass UI Dashboard
- Premium dark-mode dashboard experience
- Interactive path flow visualization
- Customizable drag-and-drop widget layout
- Live operational status, conversion funnels, and cohort insights

---

## 🧱 Monorepo Structure

```text
Frontend/       React + Vite dashboard
Backend/        Node.js + Express API and integrations
ML/             FastAPI ML and inference service
tracking-sdk/   Web and Android tracking SDKs
docker/         Nginx config and Docker deployment support
docs/           Architecture, demo script, deployment, judge prep
uploads/        Local upload storage for CSV / APK demo flows
```

---

## 🛠️ Tech Stack

- Frontend: React, Vite, Zustand, Tailwind, Recharts
- Backend: Node.js, Express, MongoDB, PostgreSQL-ready architecture
- ML: FastAPI, PyTorch, scikit-learn, ChromaDB, Gemini/RAG integration
- Integrations: Asana OAuth, Power BI export, analytics export pipelines
- Deploy: Docker, Docker Compose, Nginx

---

## ⚡ Installation

### Option 1: Docker Compose

```bash
docker compose up --build
```

### Option 2: Manual Setup

```bash
# Backend
cd Backend
npm install
npm run dev

# Frontend
cd Frontend
npm install
npm run dev

# ML
cd ML
pip install -r requirements.txt
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 🔧 Environment Configuration

Create environment files for each service using the example templates if available.

- Backend env template: `Backend/.env.example`
- Frontend env template: `Frontend/.env.example`
- ML env template: `ML/.env.example`

Common variables include API endpoints, auth credentials, database connection strings, and integration keys.

---

## 🧪 Demo Setup

To initialize the demo dataset:

```bash
cd Backend
npm run seed:mongo
```

Then use one of the seeded demo tenants:

- `ops@banka.com` / `Demo@1234`
- `ops@bankb.com` / `Demo@1234`
- `ops@bankc.com` / `Demo@1234`

---

## 🔍 What to Explore

- `Frontend/` — the enterprise dashboard UI
- `Backend/` — API, tenant isolation, auth, export, and integration services
- `ML/` — model training, inference, attribution, and FastAPI endpoints
- `tracking-sdk/` — SDKs for web and Android event capture
- `docs/` — architecture, deployment, demo script, and preparation notes

---

## 📚 Useful Links

- Demo flow: [docs/demo-script.md](./docs/demo-script.md)
- Architecture: [docs/architecture.md](./docs/architecture.md)
- Deployment: [docs/deployment.md](./docs/deployment.md)
- Judge prep: [docs/judge-qa.md](./docs/judge-qa.md)
- Submission checklist: [docs/submission-checklist.md](./docs/submission-checklist.md)

---

## 💡 Notes

This repo was built to showcase a full-stack enterprise feature intelligence platform with live analytics, ML-driven insights, and execution-ready integrations. It is optimized for rapid demoing and hackathon-ready deployment.
