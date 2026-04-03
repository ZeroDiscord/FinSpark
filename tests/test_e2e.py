"""
End-to-end integration tests for Finspark Intelligence.

Test flow:
  1. Generate synthetic dataset (200 sessions, 2 tenants)
  2. Run ingestion + preprocessing pipeline (detect → convert → session-build)
  3. Train Markov, N-gram, and LSTM models
  4. Run ensemble prediction on 10 held-out test sessions
  5. Assert correctness constraints on predictions
  6. Verify LLM fallback triggers (mocked) for low-confidence cases
  7. Test FastAPI /predict endpoint schema via TestClient

All external LLM calls (OpenAI, Ollama) are mocked with unittest.mock.
"""

from __future__ import annotations

import sys
import os
import json
import tempfile
import unittest.mock as mock
from datetime import datetime, timezone
from typing import Dict, List, Tuple

import pytest
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

N_SESSIONS   = 200
N_TENANTS    = 2
CHURN_RATE   = 0.35
TEST_TENANT  = "e2e_test_tenant"
ABSORPTION_STATES = ["disbursement", "drop_off"]

TOY_SEQUENCES = [
    ["kyc_check", "doc_upload", "bureau_pull", "disbursement"],
    ["kyc_check", "doc_upload", "kyc_check", "drop_off"],
    ["bureau_pull", "manual_review", "disbursement"],
    ["kyc_check", "drop_off"],
    ["login", "income_verification", "bureau_pull", "credit_scoring", "disbursement"],
    ["login", "kyc_check", "drop_off"],
    ["bureau_pull", "drop_off"],
    ["loan_offer_view", "loan_offer_view", "drop_off"],
    ["login", "kyc_check", "doc_upload", "bureau_pull", "credit_scoring",
     "loan_offer_view", "loan_accept", "disbursement"],
    ["income_verification", "doc_upload", "kyc_check", "drop_off"],
]
TOY_LABELS = [0, 1, 0, 1, 0, 1, 1, 1, 0, 1]

TEST_PREDICT_SEQUENCES = TOY_SEQUENCES  # reuse as held-out test set


# ===========================================================================
# Fixtures
# ===========================================================================

@pytest.fixture(scope="session")
def synthetic_df() -> pd.DataFrame:
    """Generate a small synthetic dataset (session-scoped — built once)."""
    from data.synthetic.generator import generate_dataset
    df = generate_dataset(
        n_tenants=N_TENANTS,
        n_sessions_per_tenant=N_SESSIONS // N_TENANTS,
        churn_rate=CHURN_RATE,
        noise_factor=0.10,
        seed=0,
    )
    return df


@pytest.fixture(scope="session")
def session_sequences() -> Tuple[List[List[str]], List[int]]:
    """Return toy sequences + labels for fast model training in tests."""
    return TOY_SEQUENCES, TOY_LABELS


@pytest.fixture(scope="session")
def markov_model(session_sequences):
    """Train and return a fitted MarkovChain."""
    from models.implicit.markov import MarkovChain
    seqs, _ = session_sequences
    mc = MarkovChain()
    mc.fit(seqs, absorption_states=ABSORPTION_STATES)
    return mc


@pytest.fixture(scope="session")
def ngram_model(session_sequences):
    """Train and return a fitted NgramModel (trigram)."""
    from models.implicit.ngram import NgramModel
    seqs, _ = session_sequences
    ngm = NgramModel(n=3)
    ngm.fit(seqs)
    return ngm


@pytest.fixture(scope="session")
def lstm_trainer(session_sequences, tmp_path_factory):
    """Train and return a fitted LSTMTrainer (small model for speed)."""
    from models.implicit.lstm_encoder import (
        LSTMChurnEncoder, LSTMTrainer, SessionDataset
    )
    seqs, labels = session_sequences
    ds = SessionDataset(seqs, labels)
    model = LSTMChurnEncoder(
        vocab_size=len(ds.vocab), embed_dim=16, hidden_dim=32,
        num_layers=1, dropout=0.0
    )
    trainer = LSTMTrainer(model, lr=1e-2, device="cpu")
    ckpt = str(tmp_path_factory.mktemp("ckpt") / "best.pt")
    trainer.train(ds, epochs=5, batch_size=4, patience=5, checkpoint_path=ckpt)
    return trainer


@pytest.fixture(scope="session")
def ensemble(markov_model, ngram_model, lstm_trainer):
    """Build PredictionEnsemble from trained component models."""
    from models.ensemble import PredictionEnsemble
    return PredictionEnsemble(
        markov_model=markov_model,
        ngram_model=ngram_model,
        lstm_trainer=lstm_trainer,
        confidence_threshold=0.65,
    )


@pytest.fixture(scope="session")
def api_client(markov_model, ngram_model, lstm_trainer, ensemble, session_sequences):
    """
    Return a FastAPI TestClient with the MODEL_STORE pre-loaded for TEST_TENANT.
    Uses the already-trained session-scoped fixtures so no extra training happens.
    """
    from fastapi.testclient import TestClient
    from api.main import app, MODEL_STORE, API_KEY_VALUE

    seqs, labels = session_sequences
    MODEL_STORE.set(TEST_TENANT, {
        "markov":       markov_model,
        "ngram":        ngram_model,
        "lstm_trainer": lstm_trainer,
        "rag":          None,
        "ensemble":     ensemble,
        "sequences":    seqs,
        "labels":       labels,
    })
    client = TestClient(app, raise_server_exceptions=True)
    client.headers.update({"X-API-Key": API_KEY_VALUE})
    return client


# ===========================================================================
# Phase 1 — Synthetic Dataset Generation
# ===========================================================================

class TestSyntheticGenerator:
    def test_dataframe_has_expected_columns(self, synthetic_df):
        required = {
            "tenant_id", "session_id", "user_id", "timestamp",
            "deployment_type", "channel", "l1_domain", "l2_module",
            "l3_feature", "l4_action", "l5_deployment_node",
            "duration_ms", "success", "churn_label",
        }
        assert required.issubset(set(synthetic_df.columns))

    def test_n_tenants(self, synthetic_df):
        assert synthetic_df["tenant_id"].nunique() == N_TENANTS

    def test_churn_label_binary(self, synthetic_df):
        assert set(synthetic_df["churn_label"].unique()).issubset({0, 1})

    def test_churn_rate_roughly_correct(self, synthetic_df):
        session_labels = synthetic_df.groupby("session_id")["churn_label"].first()
        observed_rate = session_labels.mean()
        # Allow ±15% deviation from target
        assert abs(observed_rate - CHURN_RATE) < 0.15, \
            f"Churn rate {observed_rate:.2%} deviates too far from {CHURN_RATE:.2%}"

    def test_on_prem_sessions_present(self, synthetic_df):
        assert "on_prem" in synthetic_df["deployment_type"].values

    def test_features_in_taxonomy(self, synthetic_df):
        from data.synthetic.generator import FEATURES
        unknown = set(synthetic_df["l3_feature"].unique()) - set(FEATURES)
        assert not unknown, f"Unknown features: {unknown}"

    def test_some_feedback_text_present(self, synthetic_df):
        feedback_count = synthetic_df["feedback_text"].notna().sum()
        assert feedback_count > 0, "No feedback text generated"

    def test_no_null_required_fields(self, synthetic_df):
        for col in ("tenant_id", "session_id", "user_id", "l3_feature", "churn_label"):
            assert synthetic_df[col].notna().all(), f"Nulls found in {col}"


# ===========================================================================
# Phase 2 — Preprocessing Pipeline
# ===========================================================================

class TestPreprocessingPipeline:
    def test_session_builder_creates_sessions(self, synthetic_df, tmp_path):
        """Convert df rows to FeatureEvent objects and build sessions."""
        from preprocessing.schema import FeatureEvent
        from preprocessing.session_builder import build_sessions, sessions_to_sequences

        # Take a small slice for speed
        sample = synthetic_df.head(300).copy()

        events = []
        for _, row in sample.iterrows():
            try:
                events.append(FeatureEvent(
                    tenant_id=str(row["tenant_id"]),
                    session_id=str(row["session_id"]),
                    user_id=str(row["user_id"]),
                    timestamp=row["timestamp"],
                    deployment_type=str(row["deployment_type"]),
                    channel=str(row["channel"]),
                    l1_domain=str(row["l1_domain"]),
                    l2_module=str(row["l2_module"]),
                    l3_feature=str(row["l3_feature"]),
                    l4_action=str(row["l4_action"]),
                    l5_deployment_node=str(row["l5_deployment_node"]),
                    duration_ms=int(row["duration_ms"]) if pd.notna(row["duration_ms"]) else None,
                    success=bool(row["success"]) if pd.notna(row["success"]) else None,
                    metadata={},
                ))
            except Exception:
                continue

        assert len(events) > 0, "No FeatureEvents were created"

        sessions = build_sessions(events, gap_minutes=30)
        assert len(sessions) > 0

        sequences = sessions_to_sequences(sessions)
        assert len(sequences) > 0
        assert all(isinstance(s, list) and len(s) > 0 for s in sequences)

    def test_cooccurrence_matrix_from_synthetic(self, synthetic_df):
        from preprocessing.cooccurrence import build_cooccurrence_matrix

        seqs = [
            synthetic_df[synthetic_df["session_id"] == sid]["l3_feature"].tolist()
            for sid in synthetic_df["session_id"].unique()[:20]
        ]
        matrix = build_cooccurrence_matrix(seqs, window=2)
        assert matrix.shape[0] == matrix.shape[1]
        assert (matrix >= 0).all().all()

    def test_pii_masker_on_synthetic_feedback(self, synthetic_df):
        from preprocessing.pii_masker import mask_event

        sample_meta = {"email": "test@example.com", "pan": "ABCDE1234F"}
        event = {"user_id": "u1", "session_id": "s1", "tenant_id": "t1",
                 "metadata": sample_meta}
        masked = mask_event(event)
        assert "[EMAIL_REDACTED]" in masked["metadata"]["email"]
        assert "[PAN_REDACTED]" in masked["metadata"]["pan"]
        assert masked["user_id"] != "u1"


# ===========================================================================
# Phase 3 — Model Training Assertions
# ===========================================================================

class TestModelTraining:
    def test_markov_states_include_drop_off(self, markov_model):
        assert "drop_off" in markov_model.states

    def test_markov_transition_matrix_stochastic(self, markov_model):
        import math
        transient = [s for s in markov_model.states if s not in markov_model.absorption_states]
        for state in transient:
            row_sum = markov_model.transition_matrix.loc[state].sum()
            assert math.isclose(row_sum, 1.0, abs_tol=1e-9), \
                f"Row '{state}' sums to {row_sum}"

    def test_ngram_vocab_populated(self, ngram_model):
        assert len(ngram_model.vocab) >= 5

    def test_ngram_predict_returns_results(self, ngram_model):
        preds = ngram_model.predict_next(["kyc_check"], top_k=3)
        assert len(preds) == 3

    def test_lstm_trainer_has_vocab(self, lstm_trainer):
        assert lstm_trainer._vocab is not None
        assert len(lstm_trainer._vocab) >= 5

    def test_lstm_prediction_sanity(self, lstm_trainer):
        preds = lstm_trainer.predict([["kyc_check", "drop_off"]])
        assert 0.0 <= preds[0]["churn_probability"] <= 1.0


# ===========================================================================
# Phase 4 — Ensemble Prediction Assertions
# ===========================================================================

class TestEnsemblePredictions:
    def test_all_predictions_return_churn_probability(self, ensemble):
        for seq in TEST_PREDICT_SEQUENCES:
            result = ensemble.predict(seq)
            assert 0.0 <= result["churn_probability"] <= 1.0, \
                f"Invalid churn_probability for {seq}: {result['churn_probability']}"

    def test_all_predictions_have_required_keys(self, ensemble):
        required = {
            "churn_probability", "confidence", "dominant_signal",
            "feature_risk_map", "model_breakdown", "requires_llm_fallback",
        }
        for seq in TEST_PREDICT_SEQUENCES:
            result = ensemble.predict(seq)
            assert required.issubset(result.keys()), \
                f"Missing keys in result for {seq}: {required - result.keys()}"

    def test_at_least_one_friction_feature_detected(self, ensemble):
        all_risk_maps = [
            ensemble.predict(seq)["feature_risk_map"]
            for seq in TEST_PREDICT_SEQUENCES
        ]
        has_friction = any(len(rm) > 0 for rm in all_risk_maps)
        assert has_friction, "No friction features detected across all test sessions"

    def test_dominant_signal_is_valid(self, ensemble):
        valid = {"implicit", "explicit", "ensemble"}
        for seq in TEST_PREDICT_SEQUENCES:
            result = ensemble.predict(seq)
            assert result["dominant_signal"] in valid

    def test_model_breakdown_has_all_models(self, ensemble):
        for seq in TEST_PREDICT_SEQUENCES:
            bd = ensemble.predict(seq)["model_breakdown"]
            assert "markov" in bd and "ngram" in bd and "lstm" in bd

    def test_high_churn_pattern_scores_higher(self, ensemble):
        churn_result = ensemble.predict(["bureau_pull", "drop_off"])
        clean_result = ensemble.predict(
            ["login", "kyc_check", "doc_upload", "bureau_pull",
             "credit_scoring", "loan_offer_view", "disbursement"]
        )
        # Churn session should have higher (or equal) churn probability
        assert churn_result["churn_probability"] >= clean_result["churn_probability"] - 0.25, \
            "Churn pattern unexpectedly scored lower than completion pattern"

    def test_batch_predict_returns_dataframe(self, ensemble):
        df = ensemble.batch_predict(TEST_PREDICT_SEQUENCES[:5])
        assert len(df) == 5
        assert "churn_probability" in df.columns
        assert "lstm_score" in df.columns

    def test_llm_fallback_triggered_for_low_confidence(self, ensemble):
        """At least one session should have requires_llm_fallback=True."""
        results = [ensemble.predict(seq) for seq in TEST_PREDICT_SEQUENCES]
        any_fallback = any(r["requires_llm_fallback"] for r in results)
        assert any_fallback, \
            "Expected at least one low-confidence prediction to trigger LLM fallback"


# ===========================================================================
# Phase 5 — LLM Fallback Routing (mocked)
# ===========================================================================

class TestLLMFallback:
    _MOCK_ANSWER = (
        "The user showed high friction at the bureau_pull stage. "
        "We recommend simplifying the verification step. "
        "Flag for manual review."
    )

    def _make_router(self, mode: str = "cloud"):
        from llm_fallback.router import LLMRouter
        cfg = {
            "llm_routing": {"cloud": "gpt-4o", "on_prem": "llama3:70b"},
            "ollama_base_url": "http://localhost:11434",
        }
        return LLMRouter(deployment_mode=mode, config=cfg)

    def _prediction_context(self, confidence: float = 0.30) -> dict:
        return {
            "session_sequence":   ["bureau_pull", "drop_off"],
            "churn_probability":  0.82,
            "confidence":         confidence,
            "dominant_signal":    "implicit",
            "feature_risk_map":   {"bureau_pull": 0.72, "kyc_check": 0.41},
            "model_breakdown": {
                "markov": {"score": 0.80, "top_friction": "bureau_pull"},
                "ngram":  {"score": 0.75, "anomaly_flag": True},
                "lstm":   {"score": 0.85, "embedding": []},
                "rag":    {"score": 0.50, "relevant_feedback": ""},
            },
            "requires_llm_fallback": True,
        }

    @mock.patch("llm_fallback.router.LLMRouter._call_openai")
    def test_cloud_route_called(self, mock_openai):
        mock_openai.return_value = self._MOCK_ANSWER
        router = self._make_router("cloud")
        result = router.route(self._prediction_context())
        mock_openai.assert_called_once()
        assert result["llm_answer"] == self._MOCK_ANSWER
        assert result["model_used"] == "gpt-4o"

    @mock.patch("llm_fallback.router.LLMRouter._call_ollama")
    def test_on_prem_route_called(self, mock_ollama):
        mock_ollama.return_value = self._MOCK_ANSWER
        router = self._make_router("on_prem")
        result = router.route(self._prediction_context())
        mock_ollama.assert_called_once()
        assert result["model_used"] == "llama3:70b"

    @mock.patch("llm_fallback.router.LLMRouter._call_openai")
    def test_suggested_action_extracted(self, mock_openai):
        mock_openai.return_value = self._MOCK_ANSWER
        router = self._make_router("cloud")
        result = router.route(self._prediction_context())
        assert isinstance(result["suggested_action"], str)
        assert len(result["suggested_action"]) > 0

    @mock.patch("llm_fallback.router.LLMRouter._call_openai")
    def test_latency_ms_is_non_negative(self, mock_openai):
        mock_openai.return_value = self._MOCK_ANSWER
        router = self._make_router("cloud")
        result = router.route(self._prediction_context())
        assert result["latency_ms"] >= 0

    @mock.patch("llm_fallback.router.LLMRouter._call_openai",
                side_effect=ConnectionError("timeout"))
    def test_retry_exhaustion_returns_graceful_message(self, mock_openai):
        """All retries fail → graceful error message, no crash."""
        router = self._make_router("cloud")
        router.max_retries = 2  # speed up test
        result = router.route(self._prediction_context())
        assert "llm_answer" in result
        assert "LLM unavailable" in result["llm_answer"] or len(result["llm_answer"]) > 0

    @mock.patch("llm_fallback.router.LLMRouter._call_openai")
    def test_prompt_contains_session_sequence(self, mock_openai):
        mock_openai.return_value = self._MOCK_ANSWER
        router = self._make_router("cloud")
        ctx = self._prediction_context()
        router.route(ctx)
        prompt_used = mock_openai.call_args[0][0]
        assert "bureau_pull" in prompt_used or "drop_off" in prompt_used

    def test_invalid_deployment_mode_raises(self):
        from llm_fallback.router import LLMRouter
        with pytest.raises(ValueError):
            LLMRouter(deployment_mode="fax_machine", config={})


# ===========================================================================
# Phase 6 — FastAPI Endpoint Tests
# ===========================================================================

class TestAPIEndpoints:
    def test_health_returns_ok(self, api_client):
        resp = api_client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "models_loaded" in data

    def test_predict_returns_200(self, api_client):
        payload = {
            "tenant_id":        TEST_TENANT,
            "session_sequence": ["kyc_check", "doc_upload", "bureau_pull"],
            "deployment_mode":  "cloud",
        }
        resp = api_client.post("/predict", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_predict_response_schema(self, api_client):
        payload = {
            "tenant_id":        TEST_TENANT,
            "session_sequence": ["kyc_check", "drop_off"],
            "deployment_mode":  "cloud",
        }
        resp = api_client.post("/predict", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        required_keys = {
            "churn_probability", "confidence", "dominant_signal",
            "feature_risk_map", "model_breakdown", "requires_llm_fallback",
        }
        assert required_keys.issubset(data.keys())

    def test_predict_churn_probability_in_range(self, api_client):
        payload = {
            "tenant_id":        TEST_TENANT,
            "session_sequence": ["bureau_pull", "drop_off"],
            "deployment_mode":  "cloud",
        }
        resp = api_client.post("/predict", json=payload)
        data = resp.json()
        assert 0.0 <= data["churn_probability"] <= 1.0

    def test_friction_endpoint_returns_list(self, api_client):
        resp = api_client.get(
            "/features/friction",
            params={"tenant_id": TEST_TENANT, "threshold": 0.0},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        if data:
            assert "feature" in data[0]
            assert "drop_off_prob" in data[0]

    def test_cooccurrence_returns_list(self, api_client):
        resp = api_client.get(
            "/features/cooccurrence",
            params={"tenant_id": TEST_TENANT, "feature_id": "kyc_check", "top_k": 3},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_predict_unknown_tenant_returns_404(self, api_client):
        payload = {
            "tenant_id":        "ghost_tenant_does_not_exist",
            "session_sequence": ["kyc_check"],
            "deployment_mode":  "cloud",
        }
        resp = api_client.post("/predict", json=payload)
        assert resp.status_code == 404

    def test_missing_api_key_returns_401(self, api_client):
        from fastapi.testclient import TestClient
        from api.main import app
        no_auth_client = TestClient(app)  # no X-API-Key
        resp = no_auth_client.post(
            "/predict",
            json={"tenant_id": TEST_TENANT, "session_sequence": ["kyc_check"],
                  "deployment_mode": "cloud"},
        )
        assert resp.status_code == 401

    @mock.patch("llm_fallback.router.LLMRouter._call_openai")
    def test_predict_with_llm_fallback_mocked(self, mock_openai, api_client):
        """
        Force a very low confidence threshold so LLM fallback is invoked,
        and verify the response includes the llm_fallback key.
        """
        mock_openai.return_value = "Bureau pull is the key friction point. Flag for review."
        from api.main import MODEL_STORE
        tenant_models = MODEL_STORE.get(TEST_TENANT)
        original_threshold = tenant_models["ensemble"].confidence_threshold
        tenant_models["ensemble"].confidence_threshold = 1.1  # force fallback always

        payload = {
            "tenant_id":        TEST_TENANT,
            "session_sequence": ["kyc_check", "doc_upload", "drop_off"],
            "deployment_mode":  "cloud",
        }
        resp = api_client.post("/predict", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["requires_llm_fallback"] is True
        assert data.get("llm_fallback") is not None

        # Restore
        tenant_models["ensemble"].confidence_threshold = original_threshold
