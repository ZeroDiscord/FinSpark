"""
Dashboard API endpoints for Finspark Intelligence.

Serves aggregated analytics data for the enterprise dashboard:
  - Tenant overview with KPIs
  - Feature adoption heatmap data
  - Journey funnel (Markov transition matrix)
  - Churn prediction distribution
  - Friction feature analysis
  - Session embeddings for customer segmentation
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class TenantOverview(BaseModel):
    tenant_id: str
    tenant_short: str
    n_sessions: int
    churn_rate: float
    markov_states: int
    ngram_vocab_size: int
    lstm_val_auc: float
    rag_documents: int
    trained_at: str


class HeatmapData(BaseModel):
    features: List[str]
    matrix: List[List[float]]


class FunnelStep(BaseModel):
    source: str
    target: str
    probability: float


class ChurnDistribution(BaseModel):
    bins: List[float]
    complete_counts: List[int]
    churn_counts: List[int]
    total_sessions: int
    churn_rate: float


class FrictionItem(BaseModel):
    feature: str
    drop_off_prob: float
    severity: str


class SegmentationPoint(BaseModel):
    x: float
    y: float
    label: int
    churn_prob: float


class FeatureUsageItem(BaseModel):
    feature: str
    usage_count: int
    usage_pct: float
    churn_rate: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_model_store():
    """Import model store from main app."""
    from api.main import MODEL_STORE
    return MODEL_STORE


def _load_manifests() -> List[Dict]:
    """Load all tenant manifests from disk."""
    models_dir = os.path.join(PROJECT_ROOT, "data", "models")
    manifests = []
    if not os.path.isdir(models_dir):
        return manifests
    for tenant_id in os.listdir(models_dir):
        manifest_path = os.path.join(models_dir, tenant_id, "manifest.json")
        if os.path.isfile(manifest_path):
            with open(manifest_path) as f:
                manifests.append(json.load(f))
    return manifests


def _load_tenant_sessions(tenant_id: str):
    """Load sequences and labels for a tenant from the synthetic CSV."""
    import pandas as pd
    data_path = os.path.join(PROJECT_ROOT, "data", "synthetic", "lending_events.csv")
    if not os.path.exists(data_path):
        return [], []
    df = pd.read_csv(data_path)
    tenant_df = df[df["tenant_id"] == tenant_id]
    if tenant_df.empty:
        return [], []

    grouped = tenant_df.groupby("session_id")
    sequences, labels = [], []
    for _, group in grouped:
        group = group.sort_values("timestamp")
        sequences.append(group["l3_feature"].tolist())
        labels.append(int(group["churn_label"].iloc[0]))
    return sequences, labels


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/tenants", response_model=List[TenantOverview])
async def get_tenants():
    """Return overview KPIs for all trained tenants."""
    manifests = _load_manifests()
    return [
        TenantOverview(
            tenant_id=m["tenant_id"],
            tenant_short=m["tenant_id"][:8],
            n_sessions=m.get("n_sessions", 0),
            churn_rate=0.0,
            markov_states=m.get("markov_states", 0),
            ngram_vocab_size=m.get("ngram_vocab_size", 0),
            lstm_val_auc=m.get("lstm_val_auc", 0.0),
            rag_documents=m.get("rag_documents", 0),
            trained_at=m.get("trained_at", ""),
        )
        for m in manifests
    ]


@router.get("/heatmap", response_model=HeatmapData)
async def get_heatmap(tenant_id: str = Query(...)):
    """Return feature co-occurrence matrix for heatmap visualization."""
    from preprocessing.cooccurrence import build_cooccurrence_matrix

    sequences, _ = _load_tenant_sessions(tenant_id)
    if not sequences:
        raise HTTPException(404, "No sessions found for this tenant.")

    matrix = build_cooccurrence_matrix(sequences, window=3)
    features = matrix.index.tolist()
    values = matrix.values.tolist()

    # Round for payload size
    values = [[round(v, 4) for v in row] for row in values]

    return HeatmapData(features=features, matrix=values)


@router.get("/funnel", response_model=List[FunnelStep])
async def get_funnel(tenant_id: str = Query(...)):
    """Return Markov transition probabilities for funnel visualization."""
    from models.implicit.markov import MarkovChain

    tenant_dir = os.path.join(PROJECT_ROOT, "data", "models", tenant_id)
    markov_path = os.path.join(tenant_dir, "markov.pkl")

    if not os.path.exists(markov_path):
        raise HTTPException(404, "Markov model not found for this tenant.")

    mc = MarkovChain.load(markov_path)
    tm = mc.export_transition_table()

    steps = []
    for src in tm.index:
        for dst in tm.columns:
            prob = float(tm.loc[src, dst])
            if prob > 0.05:  # Only include meaningful transitions
                steps.append(FunnelStep(source=src, target=dst, probability=round(prob, 4)))

    steps.sort(key=lambda x: x.probability, reverse=True)
    return steps


@router.get("/churn-distribution", response_model=ChurnDistribution)
async def get_churn_distribution(tenant_id: str = Query(...)):
    """Return churn probability distribution for the tenant."""
    import torch
    from models.implicit.lstm_encoder import LSTMChurnEncoder, LSTMTrainer, SessionDataset
    from torch.utils.data import DataLoader

    sequences, labels = _load_tenant_sessions(tenant_id)
    if not sequences:
        raise HTTPException(404, "No sessions found for this tenant.")

    tenant_dir = os.path.join(PROJECT_ROOT, "data", "models", tenant_id)
    vocab_path = os.path.join(tenant_dir, "vocab.json")
    model_path = os.path.join(tenant_dir, "best_lstm.pt")

    if not os.path.exists(vocab_path) or not os.path.exists(model_path):
        raise HTTPException(404, "LSTM model not found.")

    with open(vocab_path) as f:
        vocab = json.load(f)

    lstm_model = LSTMChurnEncoder(vocab_size=len(vocab), embed_dim=16, hidden_dim=32, num_layers=1)
    lstm_model.load_state_dict(torch.load(model_path, map_location="cpu", weights_only=True))
    lstm_model.eval()

    ds = SessionDataset(sequences, labels, vocab=vocab)
    loader = DataLoader(ds, batch_size=64, shuffle=False, collate_fn=SessionDataset.collate_fn)

    all_probs, all_labels = [], []
    with torch.no_grad():
        for padded, lengths, lbls in loader:
            probs, _ = lstm_model(padded, lengths)
            all_probs.extend(probs.squeeze(1).numpy().tolist())
            all_labels.extend(lbls.numpy().tolist())

    # Bin the probabilities
    n_bins = 20
    bin_edges = np.linspace(0, 1, n_bins + 1)
    complete_counts = [0] * n_bins
    churn_counts = [0] * n_bins

    for prob, lbl in zip(all_probs, all_labels):
        bin_idx = min(int(prob * n_bins), n_bins - 1)
        if lbl == 0:
            complete_counts[bin_idx] += 1
        else:
            churn_counts[bin_idx] += 1

    churn_rate = sum(labels) / max(len(labels), 1)

    return ChurnDistribution(
        bins=[round(b, 3) for b in bin_edges[:-1].tolist()],
        complete_counts=complete_counts,
        churn_counts=churn_counts,
        total_sessions=len(sequences),
        churn_rate=round(churn_rate, 4),
    )


@router.get("/friction", response_model=List[FrictionItem])
async def get_friction(tenant_id: str = Query(...), threshold: float = Query(0.1)):
    """Return friction features with severity labels."""
    from models.implicit.markov import MarkovChain

    tenant_dir = os.path.join(PROJECT_ROOT, "data", "models", tenant_id)
    markov_path = os.path.join(tenant_dir, "markov.pkl")

    if not os.path.exists(markov_path):
        raise HTTPException(404, "Markov model not found.")

    mc = MarkovChain.load(markov_path)
    friction = mc.get_friction_features(threshold=threshold)

    items = []
    for f in friction:
        p = f["drop_off_prob"]
        severity = "critical" if p >= 0.6 else "high" if p >= 0.4 else "moderate" if p >= 0.2 else "low"
        items.append(FrictionItem(feature=f["feature"], drop_off_prob=round(p, 4), severity=severity))

    return items


@router.get("/feature-usage", response_model=List[FeatureUsageItem])
async def get_feature_usage(tenant_id: str = Query(...)):
    """Return per-feature usage counts and churn rates."""
    from preprocessing.cooccurrence import compute_churn_conditional

    sequences, labels = _load_tenant_sessions(tenant_id)
    if not sequences:
        raise HTTPException(404, "No sessions found.")

    churn_map = compute_churn_conditional(sequences, labels)

    # Count feature occurrences
    from collections import Counter
    feature_counts = Counter(feat for seq in sequences for feat in seq)
    total_events = sum(feature_counts.values())

    items = []
    for feat, count in feature_counts.most_common():
        items.append(FeatureUsageItem(
            feature=feat,
            usage_count=count,
            usage_pct=round(count / total_events, 4),
            churn_rate=round(churn_map.get(feat, 0.0), 4),
        ))

    return items


@router.get("/segmentation")
async def get_segmentation(tenant_id: str = Query(...)):
    """Return 2D projections of session embeddings for customer segmentation."""
    import torch
    from models.implicit.lstm_encoder import LSTMChurnEncoder, SessionDataset
    from torch.utils.data import DataLoader

    sequences, labels = _load_tenant_sessions(tenant_id)
    if not sequences:
        raise HTTPException(404, "No sessions found.")

    tenant_dir = os.path.join(PROJECT_ROOT, "data", "models", tenant_id)
    vocab_path = os.path.join(tenant_dir, "vocab.json")
    model_path = os.path.join(tenant_dir, "best_lstm.pt")

    if not os.path.exists(vocab_path) or not os.path.exists(model_path):
        raise HTTPException(404, "LSTM model not found.")

    with open(vocab_path) as f:
        vocab = json.load(f)

    lstm_model = LSTMChurnEncoder(vocab_size=len(vocab), embed_dim=16, hidden_dim=32, num_layers=1)
    lstm_model.load_state_dict(torch.load(model_path, map_location="cpu", weights_only=True))
    lstm_model.eval()

    ds = SessionDataset(sequences, labels, vocab=vocab)
    loader = DataLoader(ds, batch_size=64, shuffle=False, collate_fn=SessionDataset.collate_fn)

    all_embeddings, all_probs, all_labels = [], [], []
    with torch.no_grad():
        for padded, lengths, lbls in loader:
            probs, embeddings = lstm_model(padded, lengths)
            all_embeddings.append(embeddings.numpy())
            all_probs.extend(probs.squeeze(1).numpy().tolist())
            all_labels.extend(lbls.numpy().tolist())

    embeddings_arr = np.concatenate(all_embeddings, axis=0)

    # Simple PCA to 2D (no sklearn dependency needed)
    centered = embeddings_arr - embeddings_arr.mean(axis=0)
    cov = np.cov(centered, rowvar=False)
    eigenvalues, eigenvectors = np.linalg.eigh(cov)
    # Take top 2 eigenvectors (largest eigenvalues are at the end)
    top2 = eigenvectors[:, -2:]
    projected = centered @ top2

    points = []
    for i in range(len(projected)):
        points.append({
            "x": round(float(projected[i, 0]), 4),
            "y": round(float(projected[i, 1]), 4),
            "label": int(all_labels[i]),
            "churn_prob": round(all_probs[i], 4),
        })

    return {"points": points, "n_sessions": len(points)}


@router.get("/insight")
async def get_insight(tenant_id: str = Query(...), question: str = Query("What are the highest friction features and how do they impact churn?")):
    """Generate an LLM-powered insight using the RAG pipeline and Gemini."""
    from models.explicit.rag_pipeline import FeatureRAGPipeline

    rag = FeatureRAGPipeline(collection_name=f"tenant_{tenant_id}")
    if rag.count() == 0:
        # If RAG has no docs yet, index feature usage first
        from preprocessing.cooccurrence import compute_churn_conditional
        sequences, labels = _load_tenant_sessions(tenant_id)
        if sequences:
            churn_map = compute_churn_conditional(sequences, labels)
            from collections import Counter
            feature_counts = Counter(feat for seq in sequences for feat in seq)
            feature_docs = [
                {"id": feat, "description": f"Feature {feat} in lending journey",
                 "usage_count": count, "churn_rate": round(churn_map.get(feat, 0.0), 4)}
                for feat, count in feature_counts.most_common()
            ]
            rag.index_features(feature_docs)

    result = rag.generate_insight(question=question)
    return result


@router.get("/sessions")
async def get_sample_sessions(tenant_id: str = Query(...), limit: int = Query(8)):
    """Return sample session event ribbons for the dashboard."""
    sequences, labels = _load_tenant_sessions(tenant_id)
    if not sequences:
        raise HTTPException(404, "No sessions found.")

    # Pick a mix of churn and non-churn sessions
    churn_sessions = [(s, l) for s, l in zip(sequences, labels) if l == 1]
    complete_sessions = [(s, l) for s, l in zip(sequences, labels) if l == 0]

    import random
    random.seed(42)
    sample = []
    # Take half churn, half complete
    half = limit // 2
    sample.extend(random.sample(churn_sessions, min(half, len(churn_sessions))))
    sample.extend(random.sample(complete_sessions, min(half, len(complete_sessions))))

    result = []
    for i, (seq, label) in enumerate(sample):
        result.append({
            "session_id": f"SES_{tenant_id[:4].upper()}_{100 + i:03d}",
            "events": seq[:8],  # Cap at 8 events for UI
            "is_churn": bool(label),
            "duration_sec": round(len(seq) * 3.2 + random.random() * 5, 1),
        })

    return result


@router.get("/transition-matrix")
async def get_transition_matrix(tenant_id: str = Query(...)):
    """Return the full Markov transition matrix for heatmap display."""
    from models.implicit.markov import MarkovChain

    tenant_dir = os.path.join(PROJECT_ROOT, "data", "models", tenant_id)
    markov_path = os.path.join(tenant_dir, "markov.pkl")

    if not os.path.exists(markov_path):
        raise HTTPException(404, "Markov model not found.")

    mc = MarkovChain.load(markov_path)
    tm = mc.export_transition_table()

    features = tm.index.tolist()
    matrix = [[round(float(tm.loc[src, dst]), 2) for dst in features] for src in features]

    return {"features": features, "matrix": matrix}

