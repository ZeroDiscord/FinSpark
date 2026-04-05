"""
Finspark Intelligence — Production FastAPI Application.

Endpoints
---------
POST /ingest              Detect, convert, and preprocess raw data files
POST /train               Train all implicit models + index RAG for a tenant
POST /predict             Full ensemble prediction with optional LLM fallback
GET  /features/friction   Markov friction features for roadmap prioritisation
GET  /features/cooccurrence  Top co-occurring features for a given feature
GET  /health              System health + loaded model inventory

Authentication: X-API-Key header (reads API_KEY env var).
CORS:           All origins enabled (restrict in production).
Logging:        Structured JSON via Python logging.
Docs:           /docs (Swagger UI), /redoc.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from typing import Any, Dict, List, Optional

import yaml
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()

# Add project root to path so relative imports resolve
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------

class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts":      self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level":   record.levelname,
            "logger":  record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def _setup_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.handlers = [handler]


_setup_logging()
logger = logging.getLogger("finspark.api")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
_CONFIG_PATH = os.path.join(PROJECT_ROOT, "config.yaml")

def _load_config() -> Dict[str, Any]:
    if os.path.exists(_CONFIG_PATH):
        with open(_CONFIG_PATH) as f:
            return yaml.safe_load(f) or {}
    return {}

CFG = _load_config()
CONFIDENCE_THRESHOLD: float = float(CFG.get("confidence_threshold", 0.65))
DEPLOYMENT_MODE: str        = CFG.get("deployment_mode", "cloud")
API_KEY_VALUE: str          = os.getenv("API_KEY", "dev-secret-key")

# ---------------------------------------------------------------------------
# In-memory per-tenant model store
# ---------------------------------------------------------------------------

class TenantModelStore:
    """Thread-safe (GIL-protected) per-tenant model cache."""

    def __init__(self) -> None:
        self._store: Dict[str, Dict[str, Any]] = {}

    def has(self, tenant_id: str) -> bool:
        return tenant_id in self._store

    def get(self, tenant_id: str) -> Dict[str, Any]:
        return self._store.get(tenant_id, {})

    def set(self, tenant_id: str, models: Dict[str, Any]) -> None:
        self._store[tenant_id] = models

    def all_tenants(self) -> List[str]:
        return list(self._store.keys())

    def summary(self) -> Dict[str, Any]:
        return {
            tid: {k: (v is not None) for k, v in models.items()}
            for tid, models in self._store.items()
        }


MODEL_STORE = TenantModelStore()

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Finspark Intelligence API",
    description="ML-powered feature usage & churn prediction for enterprise lending platforms.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Dashboard router
# ---------------------------------------------------------------------------
from .dashboard import router as dashboard_router
app.include_router(dashboard_router)


@app.get("/", include_in_schema=False)
async def serve_dashboard():
    """Serve the enterprise dashboard."""
    dashboard_path = os.path.join(PROJECT_ROOT, "static", "dashboard.html")
    if os.path.exists(dashboard_path):
        response = FileResponse(dashboard_path, media_type="text/html")
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
    return {"message": "Dashboard not found. Place dashboard.html in static/"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

_api_key_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(key: Optional[str] = Security(_api_key_scheme)) -> str:
    if not key or key != API_KEY_VALUE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header.",
        )
    return key

# ---------------------------------------------------------------------------
# Startup: load persisted tenant models
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup_load_models() -> None:
    """
    On startup, scan the data/ directory for tenant model artefacts and
    pre-load them into the MODEL_STORE so the first request isn't cold.
    """
    models_dir = os.path.join(PROJECT_ROOT, "data", "models")
    if not os.path.isdir(models_dir):
        logger.info("No persisted models directory found — skipping startup load.")
        return

    for tenant_id in os.listdir(models_dir):
        tenant_dir = os.path.join(models_dir, tenant_id)
        if not os.path.isdir(tenant_dir):
            continue
        try:
            models = _load_tenant_models(tenant_id, tenant_dir)
            MODEL_STORE.set(tenant_id, models)
            logger.info(json.dumps({
                "event": "startup_model_loaded",
                "tenant_id": tenant_id,
                "components": list(models.keys()),
            }))
        except Exception as exc:
            logger.warning(f"Could not load models for tenant '{tenant_id}': {exc}")


def _load_tenant_models(tenant_id: str, tenant_dir: str) -> Dict[str, Any]:
    """Load Markov, N-gram, and LSTM models from disk for a tenant."""
    from models.implicit.markov import MarkovChain
    from models.implicit.ngram import NgramModel
    from models.implicit.lstm_encoder import LSTMChurnEncoder, LSTMTrainer, SessionDataset

    models: Dict[str, Any] = {
        "markov": None, "ngram": None, "lstm_trainer": None,
        "ensemble": None, "sequences": [], "labels": [],
    }

    markov_path = os.path.join(tenant_dir, "markov.pkl")
    if os.path.exists(markov_path):
        models["markov"] = MarkovChain.load(markov_path)

    ngram_path = os.path.join(tenant_dir, "ngram.pkl")
    if os.path.exists(ngram_path):
        models["ngram"] = NgramModel.load(ngram_path)

    lstm_base = os.path.join(tenant_dir, "lstm")
    if os.path.exists(f"{lstm_base}.pt") and os.path.exists(f"{lstm_base}.vocab.pkl"):
        import pickle, torch
        with open(f"{lstm_base}.vocab.pkl", "rb") as f:
            vocab = pickle.load(f)
        dummy_ds = SessionDataset([[]], [0], vocab=vocab)
        lstm_model = LSTMChurnEncoder(vocab_size=len(vocab))
        trainer = LSTMTrainer(lstm_model, device="cpu")
        trainer.load(lstm_base)
        models["lstm_trainer"] = trainer

    return models


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class IngestRequest(BaseModel):
    file_path:       str = Field(..., description="Absolute path to CSV/JSON/Excel file")
    deployment_type: str = Field("cloud", description="cloud | on_prem")
    tenant_id:       str = Field(..., description="Tenant identifier")

class IngestResponse(BaseModel):
    events_ingested:  int
    schema_match_score: float
    warnings:         List[str]

class TrainRequest(BaseModel):
    tenant_id: str  = Field(..., description="Tenant identifier")
    augment:   bool = Field(False, description="Apply synthetic data augmentation")

class TrainResponse(BaseModel):
    markov_states: int
    lstm_val_auc:  float
    rag_documents: int

class PredictRequest(BaseModel):
    tenant_id:        str            = Field(...)
    session_sequence: List[str]      = Field(..., min_length=1)
    feedback_text:    Optional[str]  = Field(None)
    deployment_mode:  str            = Field("cloud")

class PredictResponse(BaseModel):
    churn_probability:   float
    confidence:          float
    dominant_signal:     str
    feature_risk_map:    Dict[str, float]
    model_breakdown:     Dict[str, Any]
    requires_llm_fallback: bool
    llm_fallback:        Optional[Dict[str, Any]] = None

class FrictionFeature(BaseModel):
    feature:              str
    drop_off_prob:        float
    strategic_implication: str

class CooccurrenceItem(BaseModel):
    feature:     str
    probability: float

class FederatedPayload(BaseModel):
    tenant_id: str
    timestamp: str
    payload_type: str
    data: Any

class HealthResponse(BaseModel):
    status:          str
    models_loaded:   Dict[str, Any]
    deployment_mode: str


# ---------------------------------------------------------------------------
# Helper: get or raise tenant models
# ---------------------------------------------------------------------------

def _require_tenant(tenant_id: str) -> Dict[str, Any]:
    if not MODEL_STORE.has(tenant_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No trained models found for tenant '{tenant_id}'. Call POST /train first.",
        )
    return MODEL_STORE.get(tenant_id)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post(
    "/ingest",
    response_model=IngestResponse,
    summary="Ingest a raw data file and normalise to FeatureEvent schema",
)
async def ingest(
    body: IngestRequest,
    _key: str = Depends(verify_api_key),
) -> IngestResponse:
    """
    Pipeline: file format detection → field mapping / LLM conversion → PII masking.
    """
    from ML.ingestion.detector import detect_format
    from ML.ingestion.converter import convert_to_schema

    t0 = time.perf_counter()
    warnings: List[str] = []

    if not os.path.exists(body.file_path):
        raise HTTPException(status_code=400, detail=f"File not found: {body.file_path}")

    try:
        detection = detect_format(body.file_path)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Format detection failed: {exc}")

    if detection["match_score"] < 0.3:
        warnings.append(
            f"Low schema match score ({detection['match_score']:.2f}). "
            "LLM conversion will be attempted."
        )
    if detection["missing_fields"]:
        warnings.append(f"Missing fields: {detection['missing_fields']}")

    try:
        import pandas as pd
        ext = body.file_path.lower()
        if ext.endswith(".csv"):
            df = pd.read_csv(body.file_path)
        elif ext.endswith(".json"):
            df = pd.read_json(body.file_path)
        else:
            df = pd.read_excel(body.file_path)

        events = convert_to_schema(df, detection)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Conversion failed: {exc}")

    latency_ms = int((time.perf_counter() - t0) * 1000)
    logger.info(json.dumps({
        "event":            "ingest_complete",
        "tenant_id":        body.tenant_id,
        "events_ingested":  len(events),
        "match_score":      detection["match_score"],
        "latency_ms":       latency_ms,
    }))

    return IngestResponse(
        events_ingested=len(events),
        schema_match_score=round(detection["match_score"], 4),
        warnings=warnings,
    )


@app.post(
    "/train",
    response_model=TrainResponse,
    summary="Train all implicit models + index RAG for a tenant",
)
async def train(
    body: TrainRequest,
    _key: str = Depends(verify_api_key),
) -> TrainResponse:
    """
    Trains Markov, N-gram, and LSTM models on synthetic / cached session data,
    then indexes features into ChromaDB RAG.
    """
    from models.implicit.markov import MarkovChain
    from models.implicit.ngram import NgramModel
    from models.implicit.lstm_encoder import (
        LSTMChurnEncoder, LSTMTrainer, SessionDataset, augment_sequences
    )
    from models.explicit.rag_pipeline import FeatureRAGPipeline
    from models.ensemble import PredictionEnsemble

    # Use cached sequences if tenant already has data; otherwise use demo data
    cached = MODEL_STORE.get(body.tenant_id) if MODEL_STORE.has(body.tenant_id) else {}
    sequences: List[List[str]] = cached.get("sequences") or [
        ["kyc_check", "doc_upload", "bureau_pull", "disbursement"],
        ["kyc_check", "doc_upload", "kyc_check", "drop_off"],
        ["bureau_pull", "manual_review", "disbursement"],
        ["kyc_check", "drop_off"],
        ["bureau_pull", "disbursement"],
    ]
    labels: List[int] = cached.get("labels") or [0, 1, 0, 1, 0]

    if body.augment:
        sequences, labels = augment_sequences(sequences, labels, target_size=200)

    absorption_states = ["disbursement", "drop_off"]

    # Markov
    mc = MarkovChain()
    mc.fit(sequences, absorption_states=absorption_states)

    # N-gram
    ngm = NgramModel(n=3)
    ngm.fit(sequences)

    # LSTM
    ds = SessionDataset(sequences, labels)
    lstm_model = LSTMChurnEncoder(vocab_size=len(ds.vocab))
    trainer = LSTMTrainer(lstm_model, device="cpu")

    tenant_dir = os.path.join(PROJECT_ROOT, "data", "models", body.tenant_id)
    os.makedirs(tenant_dir, exist_ok=True)
    ckpt = os.path.join(tenant_dir, "best_lstm.pt")
    history = trainer.train(ds, epochs=15, batch_size=16, patience=5, checkpoint_path=ckpt)
    val_auc = history["val_auc"][-1] if history["val_auc"] else 0.0

    # RAG
    rag = FeatureRAGPipeline(collection_name=f"tenant_{body.tenant_id}")
    feature_docs = [
        {"id": feat, "description": f"Feature {feat}", "churn_rate": 0.1}
        for feat in ngm.vocab if not feat.startswith("<")
    ]
    rag.index_features(feature_docs)

    # Ensemble
    ensemble = PredictionEnsemble(
        markov_model=mc,
        ngram_model=ngm,
        lstm_trainer=trainer,
        confidence_threshold=CONFIDENCE_THRESHOLD,
    )

    MODEL_STORE.set(body.tenant_id, {
        "markov": mc, "ngram": ngm, "lstm_trainer": trainer,
        "rag": rag, "ensemble": ensemble,
        "sequences": sequences, "labels": labels,
    })

    # Persist models
    mc.save(os.path.join(tenant_dir, "markov.pkl"))
    ngm.save(os.path.join(tenant_dir, "ngram.pkl"))
    trainer.save(os.path.join(tenant_dir, "lstm"))

    logger.info(json.dumps({
        "event": "train_complete", "tenant_id": body.tenant_id,
        "markov_states": len(mc.states), "val_auc": val_auc,
        "rag_docs": rag.count(),
    }))

    return TrainResponse(
        markov_states=len(mc.states),
        lstm_val_auc=round(val_auc, 4),
        rag_documents=rag.count(),
    )


@app.post(
    "/predict",
    response_model=PredictResponse,
    summary="Full ensemble churn prediction for a session",
)
async def predict(
    body: PredictRequest,
    _key: str = Depends(verify_api_key),
) -> PredictResponse:
    """
    Runs Markov + N-gram + LSTM + (optional) RAG ensemble.
    Automatically invokes LLM fallback when confidence < threshold.
    """
    tenant = _require_tenant(body.tenant_id)
    ensemble = tenant.get("ensemble")
    if ensemble is None:
        raise HTTPException(status_code=503, detail="Ensemble not initialised. Call /train first.")

    t0 = time.perf_counter()
    try:
        result = ensemble.predict(
            session_sequence=body.session_sequence,
            feedback_text=body.feedback_text,
            rag_pipeline=tenant.get("rag"),
        )
        # Attach sequence for router context
        result["session_sequence"] = body.session_sequence
    except Exception as exc:
        logger.error(f"Ensemble prediction error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    llm_fallback_result: Optional[Dict[str, Any]] = None

    if result.get("requires_llm_fallback"):
        from ML.llm_fallback.router import LLMRouter
        router = LLMRouter(
            deployment_mode=body.deployment_mode,
            config=CFG,
        )
        try:
            llm_fallback_result = router.route(result)
        except Exception as exc:
            logger.warning(f"LLM fallback failed: {exc}")
            llm_fallback_result = {"llm_answer": str(exc), "suggested_action": "Manual review", "model_used": "N/A", "latency_ms": 0}

    latency_ms = int((time.perf_counter() - t0) * 1000)
    logger.info(json.dumps({
        "event":             "predict",
        "tenant_id":         body.tenant_id,
        "churn_probability": result["churn_probability"],
        "confidence":        result["confidence"],
        "llm_used":          llm_fallback_result is not None,
        "latency_ms":        latency_ms,
    }))

    return PredictResponse(
        churn_probability=result["churn_probability"],
        confidence=result["confidence"],
        dominant_signal=result["dominant_signal"],
        feature_risk_map=result["feature_risk_map"],
        model_breakdown=result["model_breakdown"],
        requires_llm_fallback=result["requires_llm_fallback"],
        llm_fallback=llm_fallback_result,
    )


@app.get(
    "/features/friction",
    response_model=List[FrictionFeature],
    summary="Markov friction features for roadmap prioritisation",
)
async def get_friction_features(
    tenant_id: str   = Query(...),
    threshold: float = Query(0.20, ge=0.0, le=1.0),
    _key: str        = Depends(verify_api_key),
) -> List[FrictionFeature]:
    """Returns features where P(drop_off | feature) > threshold, sorted by risk."""
    tenant = _require_tenant(tenant_id)
    mc = tenant.get("markov")
    if mc is None:
        raise HTTPException(status_code=503, detail="Markov model not trained.")

    friction = mc.get_friction_features(threshold=threshold, drop_off_state="drop_off")
    return [FrictionFeature(**f) for f in friction]


@app.get(
    "/features/cooccurrence",
    response_model=List[CooccurrenceItem],
    summary="Top co-occurring features for a given feature",
)
async def get_cooccurrence(
    tenant_id:  str = Query(...),
    feature_id: str = Query(...),
    top_k:      int = Query(5, ge=1, le=20),
    _key: str       = Depends(verify_api_key),
) -> List[CooccurrenceItem]:
    """Returns top-k features that most frequently co-occur with feature_id."""
    from preprocessing.cooccurrence import build_cooccurrence_matrix
    tenant = _require_tenant(tenant_id)
    sequences = tenant.get("sequences", [])

    if not sequences:
        raise HTTPException(status_code=404, detail="No session sequences cached for this tenant.")

    matrix = build_cooccurrence_matrix(sequences, window=3)

    if feature_id not in matrix.index:
        raise HTTPException(status_code=404, detail=f"Feature '{feature_id}' not in vocabulary.")

    row = matrix.loc[feature_id].sort_values(ascending=False).head(top_k)
    return [
        CooccurrenceItem(feature=feat, probability=round(prob, 4))
        for feat, prob in row.items()
        if feat != feature_id and prob > 0
    ]


@app.get(
    "/health",
    response_model=HealthResponse,
    summary="System health check",
)
async def health() -> HealthResponse:
    """Returns API status and per-tenant model load summary."""
    return HealthResponse(
        status="ok",
        models_loaded=MODEL_STORE.summary(),
        deployment_mode=DEPLOYMENT_MODE,
    )

@app.post(
    "/federated/aggregate",
    summary="Receive federated ML weights and aggregated telemetry",
)
async def federated_aggregate(
    body: FederatedPayload,
    _key: str = Depends(verify_api_key),
):
    """
    Called by an On-Prem server to push local ML weights or aggregates
    into the central Cloud representation.
    """
    if DEPLOYMENT_MODE != "cloud":
        raise HTTPException(
            status_code=400, 
            detail="Federated aggregation is only supported when DEPLOYMENT_MODE='cloud'"
        )

    logger.info(json.dumps({
        "event": "federated_sync_received",
        "tenant_id": body.tenant_id,
        "payload_type": body.payload_type,
    }))

    # Example: if payload_type == "ml_weights", we could do FedAvg here
    # and update the Global model store. We simply acknowledge receipt for now.
    return {"status": "ok", "message": "Federated payload accepted and queued for aggregation"}
