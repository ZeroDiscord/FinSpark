# Enterprise Feature Intelligence Platform

Enterprise Feature Intelligence Platform is a hackathon-ready monorepo for enterprise product analytics. It detects features from APKs and websites, instruments usage tracking, processes sessions, predicts churn, generates product recommendations, pushes actions to Asana, and exports analytics to Power BI.

## Problem Statement
Enterprise product teams know users are dropping off, but they rarely know which feature is responsible, why it is happening, or how to route that insight into execution fast enough to matter.

## What We Built
- APK and website feature detection
- Tracking SDK for web and Android
- Usage event ingestion and processed sessions
- ML-powered churn prediction and drop-off attribution
- Multi-tenant analytics dashboard
- Recommendation engine with prioritization
- Asana integration for task creation
- Power BI export for enterprise reporting

## Monorepo Structure
```text
Frontend/       React + Vite dashboard
Backend/        Node.js + Express API and integrations
ML/             FastAPI ML service
tracking-sdk/   Web and Android tracking SDKs
docker/         Nginx config and Docker support
docs/           Demo, architecture, deployment, and judge prep
uploads/        Local upload storage for CSV/APK demo flows
```

## Tech Stack
- Frontend: React, Vite, Zustand, Recharts
- Backend: Node.js, Express, MongoDB, PostgreSQL compatibility paths
- ML: FastAPI, PyTorch, scikit-learn, ChromaDB
- Integrations: Asana OAuth, Power BI export
- Deployment: Docker, Docker Compose

## Running Locally
### Option 1: Docker
```bash
docker compose up --build
```

### Option 2: Manual
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

## Environment Variables
- Backend env template: [Backend/.env.example](./Backend/.env.example)
- Frontend env template: [Frontend/.env.example](./Frontend/.env.example)
- ML env template: [ML/.env.example](./ML/.env.example)

## Demo Setup
```bash
cd Backend
npm run seed:mongo
```

Default demo login after seeding:
- `ops@banka.com` / `Demo@1234`
- `ops@bankb.com` / `Demo@1234`
- `ops@bankc.com` / `Demo@1234`

## Demo Flow
See [docs/demo-script.md](./docs/demo-script.md)

## Architecture
See [docs/architecture.md](./docs/architecture.md)

## Deployment Plan
See [docs/deployment.md](./docs/deployment.md)

## Judge Prep
See [docs/judge-qa.md](./docs/judge-qa.md)

## Submission Checklist
See [docs/submission-checklist.md](./docs/submission-checklist.md)
