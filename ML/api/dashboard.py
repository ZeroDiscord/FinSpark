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
import pickle
import sys
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(PROJECT_ROOT)
for path in (PROJECT_ROOT, REPO_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)

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

def _tenant_dir(tenant_id: str) -> str:
    return os.path.join(PROJECT_ROOT, "data", "models", tenant_id)


def _load_markov(tenant_id: str):
    from models.implicit.markov import MarkovChain
    path = os.path.join(_tenant_dir(tenant_id), "markov.pkl")
    if not os.path.exists(path):
        raise HTTPException(404, f"Markov model not found for tenant '{tenant_id}'. Train first.")
    return MarkovChain.load(path)


def _load_ngram(tenant_id: str):
    from models.implicit.ngram import NgramModel
    path = os.path.join(_tenant_dir(tenant_id), "ngram.pkl")
    if not os.path.exists(path):
        raise HTTPException(404, f"N-gram model not found for tenant '{tenant_id}'. Train first.")
    return NgramModel.load(path)


def _load_lstm_trainer(tenant_id: str):
    """
    Load the LSTMTrainer from the saved lstm.pt + lstm.vocab.pkl artefacts.
    trainer.save(path) writes:
      <path>.pt        — model state dict
      <path>.vocab.pkl — vocabulary pickle
    """
    import torch
    from models.implicit.lstm_encoder import LSTMChurnEncoder, LSTMTrainer

    base = os.path.join(_tenant_dir(tenant_id), "lstm")
    pt_path    = f"{base}.pt"
    vocab_path = f"{base}.vocab.pkl"

    if not os.path.exists(pt_path) or not os.path.exists(vocab_path):
        raise HTTPException(404, f"LSTM model not found for tenant '{tenant_id}'. Train first.")

    with open(vocab_path, "rb") as f:
        vocab = pickle.load(f)

    lstm_model = LSTMChurnEncoder(vocab_size=len(vocab), embed_dim=16, hidden_dim=32, num_layers=1)
    trainer = LSTMTrainer(lstm_model, device="cpu")
    trainer.load(base)   # loads weights + vocab from <base>.pt / <base>.vocab.pkl
    return trainer, vocab


def _reconstruct_sessions_from_markov(mc) -> tuple[list, list]:
    """
    When no CSV data exists, reconstruct plausible sessions from the Markov
    transition matrix by sampling random walks. This ensures all dashboard
    endpoints work even without a raw data file.
    """
    import random
    random.seed(42)

    absorption = set(mc.absorption_states)
    transient  = [s for s in mc.states if s not in absorption]
    if not transient:
        transient = list(mc.states)

    # Use transition matrix for weighted sampling
    tm = mc.transition_matrix  # pd.DataFrame

    sequences, labels = [], []
    target = max(200, len(mc.states) * 20)

    for _ in range(target):
        # Start from a random transient state
        state = random.choice(transient)
        seq = [state]
        for _step in range(12):
            if state in absorption:
                break
            if state not in tm.index:
                break
            row = tm.loc[state]
            states_list = list(row.index)
            weights = [float(row[s]) for s in states_list]
            total_w  = sum(weights)
            if total_w == 0:
                break
            state = random.choices(states_list, weights=weights, k=1)[0]
            seq.append(state)
            if state in absorption:
                break

        label = 1 if seq[-1] == "drop_off" else 0
        sequences.append(seq)
        labels.append(label)

    return sequences, labels


def _load_tenant_sessions(tenant_id: str) -> tuple[list, list]:
    """
    Load session sequences and labels for a tenant.

    Priority:
      1. In-memory MODEL_STORE (fastest, always up-to-date after training)
      2. Reconstruct from saved Markov model (deterministic, always available)
    """
    # 1. Try in-memory store first
    try:
        from api.main import MODEL_STORE
        if MODEL_STORE.has(tenant_id):
            cached = MODEL_STORE.get(tenant_id)
            seqs   = cached.get("sequences", [])
            labels = cached.get("labels", [])
            if seqs:
                return seqs, labels
    except Exception:
        pass

    # 2. Fall back to Markov-based reconstruction
    try:
        mc = _load_markov(tenant_id)
        return _reconstruct_sessions_from_markov(mc)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(404, f"Cannot load sessions for tenant '{tenant_id}': {exc}")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/tenants", response_model=List[TenantOverview])
async def get_tenants():
    """Return overview KPIs for all trained tenants."""
    models_dir = os.path.join(PROJECT_ROOT, "data", "models")
    if not os.path.isdir(models_dir):
        return []

    results = []
    for tenant_id in os.listdir(models_dir):
        tenant_dir_path = os.path.join(models_dir, tenant_id)
        if not os.path.isdir(tenant_dir_path):
            continue
        try:
            # Load stats from saved models
            markov_states    = 0
            ngram_vocab_size = 0
            lstm_val_auc     = 0.0
            trained_at       = ""
            n_sessions       = 0
            rag_documents    = 0

            markov_pkl = os.path.join(tenant_dir_path, "markov.pkl")
            if os.path.exists(markov_pkl):
                from models.implicit.markov import MarkovChain
                mc = MarkovChain.load(markov_pkl)
                markov_states = len(mc.states)
                seqs, labels  = _reconstruct_sessions_from_markov(mc)
                n_sessions    = len(seqs)

            ngram_pkl = os.path.join(tenant_dir_path, "ngram.pkl")
            if os.path.exists(ngram_pkl):
                from models.implicit.ngram import NgramModel
                ngm = NgramModel.load(ngram_pkl)
                ngram_vocab_size = len(getattr(ngm, "vocab", {}))

            # Try to read trained_at from the lstm pt modification time
            lstm_pt = os.path.join(tenant_dir_path, "lstm.pt")
            if os.path.exists(lstm_pt):
                import datetime
                mtime = os.path.getmtime(lstm_pt)
                trained_at = datetime.datetime.fromtimestamp(mtime).isoformat()

            # Churn rate from reconstruction
            if n_sessions:
                churn_rate = round(sum(labels) / n_sessions, 4)
            else:
                churn_rate = 0.0

            # RAG document count
            try:
                from models.explicit.rag_pipeline import FeatureRAGPipeline
                rag = FeatureRAGPipeline(collection_name=f"tenant_{tenant_id}")
                rag_documents = rag.count()
            except Exception:
                rag_documents = 0

            results.append(TenantOverview(
                tenant_id=tenant_id,
                tenant_short=tenant_id[:8],
                n_sessions=n_sessions,
                churn_rate=churn_rate,
                markov_states=markov_states,
                ngram_vocab_size=ngram_vocab_size,
                lstm_val_auc=lstm_val_auc,
                rag_documents=rag_documents,
                trained_at=trained_at,
            ))
        except Exception:
            continue

    return results


@router.get("/heatmap", response_model=HeatmapData)
async def get_heatmap(tenant_id: str = Query(...)):
    """Return feature co-occurrence matrix for heatmap visualization."""
    from preprocessing.cooccurrence import build_cooccurrence_matrix

    sequences, _ = _load_tenant_sessions(tenant_id)
    matrix = build_cooccurrence_matrix(sequences, window=3)
    features = matrix.index.tolist()
    values = [[round(v, 4) for v in row] for row in matrix.values.tolist()]
    return HeatmapData(features=features, matrix=values)


@router.get("/funnel", response_model=List[FunnelStep])
async def get_funnel(tenant_id: str = Query(...)):
    """Return Markov transition probabilities for funnel visualization."""
    mc = _load_markov(tenant_id)
    tm = mc.export_transition_table()

    steps = []
    for src in tm.index:
        for dst in tm.columns:
            prob = float(tm.loc[src, dst])
            if prob > 0.05:
                steps.append(FunnelStep(source=src, target=dst, probability=round(prob, 4)))

    steps.sort(key=lambda x: x.probability, reverse=True)
    return steps


@router.get("/churn-distribution", response_model=ChurnDistribution)
async def get_churn_distribution(tenant_id: str = Query(...)):
    """Return churn probability distribution using the LSTM model."""
    import torch
    from models.implicit.lstm_encoder import SessionDataset
    from torch.utils.data import DataLoader

    sequences, labels = _load_tenant_sessions(tenant_id)
    trainer, vocab    = _load_lstm_trainer(tenant_id)

    ds     = SessionDataset(sequences, labels, vocab=vocab)
    loader = DataLoader(ds, batch_size=64, shuffle=False, collate_fn=SessionDataset.collate_fn)

    all_probs, all_labels = [], []
    trainer.model.eval()
    with torch.no_grad():
        for padded, lengths, lbls in loader:
            probs, _ = trainer.model(padded, lengths)
            all_probs.extend(probs.squeeze(1).numpy().tolist())
            all_labels.extend(lbls.numpy().tolist())

    n_bins = 20
    bin_edges      = np.linspace(0, 1, n_bins + 1)
    complete_counts = [0] * n_bins
    churn_counts    = [0] * n_bins

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
    mc      = _load_markov(tenant_id)
    friction = mc.get_friction_features(threshold=threshold)

    items = []
    for f in friction:
        p        = f["drop_off_prob"]
        severity = "critical" if p >= 0.6 else "high" if p >= 0.4 else "moderate" if p >= 0.2 else "low"
        items.append(FrictionItem(feature=f["feature"], drop_off_prob=round(p, 4), severity=severity))

    return items


@router.get("/feature-usage", response_model=List[FeatureUsageItem])
async def get_feature_usage(tenant_id: str = Query(...)):
    """Return per-feature usage counts and churn rates."""
    from collections import Counter
    from preprocessing.cooccurrence import compute_churn_conditional

    sequences, labels = _load_tenant_sessions(tenant_id)
    churn_map         = compute_churn_conditional(sequences, labels)

    feature_counts = Counter(feat for seq in sequences for feat in seq)
    total_events   = sum(feature_counts.values()) or 1

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
    from models.implicit.lstm_encoder import SessionDataset
    from torch.utils.data import DataLoader

    sequences, labels = _load_tenant_sessions(tenant_id)
    trainer, vocab    = _load_lstm_trainer(tenant_id)

    ds     = SessionDataset(sequences, labels, vocab=vocab)
    loader = DataLoader(ds, batch_size=64, shuffle=False, collate_fn=SessionDataset.collate_fn)

    all_embeddings, all_probs, all_labels = [], [], []
    trainer.model.eval()
    with torch.no_grad():
        for padded, lengths, lbls in loader:
            probs, embeddings = trainer.model(padded, lengths)
            all_embeddings.append(embeddings.numpy())
            all_probs.extend(probs.squeeze(1).numpy().tolist())
            all_labels.extend(lbls.numpy().tolist())

    embeddings_arr = np.concatenate(all_embeddings, axis=0)

    # PCA to 2D (no sklearn dependency)
    centered     = embeddings_arr - embeddings_arr.mean(axis=0)
    cov          = np.cov(centered, rowvar=False)
    eigenvalues, eigenvectors = np.linalg.eigh(cov)
    top2         = eigenvectors[:, -2:]
    projected    = centered @ top2

    points = [
        {
            "x": round(float(projected[i, 0]), 4),
            "y": round(float(projected[i, 1]), 4),
            "label": int(all_labels[i]),
            "churn_prob": round(all_probs[i], 4),
        }
        for i in range(len(projected))
    ]

    return {"points": points, "n_sessions": len(points)}


@router.get("/insight")
async def get_insight(
    tenant_id: str = Query(...),
    question:  str = Query("What are the highest friction features and how do they impact churn?"),
):
    """
    Generate an LLM-powered insight using the RAG pipeline.
    Returns a plain string (the answer text) for easy frontend consumption.
    """
    from models.explicit.rag_pipeline import FeatureRAGPipeline

    rag = FeatureRAGPipeline(collection_name=f"tenant_{tenant_id}")

    # Auto-index if collection is empty
    if rag.count() == 0:
        from collections import Counter
        from preprocessing.cooccurrence import compute_churn_conditional
        sequences, labels = _load_tenant_sessions(tenant_id)
        if sequences:
            churn_map      = compute_churn_conditional(sequences, labels)
            feature_counts = Counter(feat for seq in sequences for feat in seq)
            feature_docs   = [
                {
                    "id": feat,
                    "description": f"Feature '{feat}' appears in lending user journeys.",
                    "usage_count": count,
                    "churn_rate": round(churn_map.get(feat, 0.0), 4),
                }
                for feat, count in feature_counts.most_common()
            ]
            rag.index_features(feature_docs)

    result = rag.generate_insight(question=question)
    # Return only the answer string so frontend can consume it directly
    return result.get("answer", "")


@router.get("/sessions")
async def get_sample_sessions(tenant_id: str = Query(...), limit: int = Query(8)):
    """Return sample session event ribbons for the dashboard."""
    import random

    sequences, labels = _load_tenant_sessions(tenant_id)

    churn_sessions    = [(s, l) for s, l in zip(sequences, labels) if l == 1]
    complete_sessions = [(s, l) for s, l in zip(sequences, labels) if l == 0]

    random.seed(42)
    half   = limit // 2
    sample = []
    sample.extend(random.sample(churn_sessions,    min(half, len(churn_sessions))))
    sample.extend(random.sample(complete_sessions, min(limit - len(sample), len(complete_sessions))))

    result = []
    for i, (seq, label) in enumerate(sample):
        result.append({
            "session_id":   f"SES_{tenant_id[:4].upper()}_{100 + i:03d}",
            "events":       seq[:10],
            "is_churn":     bool(label),
            "duration_sec": round(len(seq) * 3.2 + random.random() * 5, 1),
        })

    return result


@router.get("/transition-matrix")
async def get_transition_matrix(tenant_id: str = Query(...)):
    """Return the full Markov transition matrix for heatmap display."""
    mc = _load_markov(tenant_id)
    tm = mc.export_transition_table()

    features = tm.index.tolist()
    matrix   = [[round(float(tm.loc[src, dst]), 2) for dst in features] for src in features]

    return {"features": features, "matrix": matrix}
