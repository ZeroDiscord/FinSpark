# Deployment Plan

## Best Hackathon Deployment
- Frontend: Vercel
- Backend: Render Web Service
- ML Service: Render Web Service
- MongoDB: MongoDB Atlas
- PostgreSQL: Neon

## Why This Is Best
- Fast setup with managed URLs
- Lower demo risk than a self-managed VPS
- Easy environment-variable management
- Clean public endpoints for judges and teammates

## Alternative
- Single Docker VPS for full-stack local or remote demo
- Best when internet reliability is uncertain and you want one controlled environment

## Service-by-Service
### Frontend
- Build command: `npm run build`
- Output directory: `dist`
- Point API base URL to backend public URL

### Backend
- Run as Docker service or Node web service
- Configure `FRONTEND_URL`, `MONGO_URI`, `ML_BASE_URL`, Asana, and Power BI credentials

### ML Service
- Deploy separately so prediction latency is isolated from core API
- Keep `API_KEY` private and only used server-to-server

### Databases
- MongoDB Atlas for active product data
- Neon or Railway Postgres for compatibility and legacy routes

## MVP Recommendation
- Ship managed cloud deployment for judges
- Keep `docker compose up --build` ready as fallback on the demo laptop
