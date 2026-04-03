"""
Prediction Ensemble for Finspark Intelligence.

Fuses scores from four model families into a single churn prediction:
  - Markov Chain    (absorption probability to drop_off)
  - N-gram Model    (perplexity-based anomaly score)
  - LSTM Encoder    (learned churn probability + session embedding)
  - RAG Pipeline    (sentiment-derived churn signal from feedback)

Weights are configurable and normalised to sum to 1.0 at runtime.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from models.interpretability import TaxonomyInterpreter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default component weights
# ---------------------------------------------------------------------------
DEFAULT_WEIGHTS: Dict[str, float] = {
    "markov": 0.30,
    "ngram":  0.20,
    "lstm":   0.35,
    "rag":    0.15,
}

# Perplexity above this is considered anomalous (mapped to score 1.0)
PERPLEXITY_MAX = 50.0

# Confidence threshold below which LLM fallback is triggered
DEFAULT_CONFIDENCE_THRESHOLD = 0.65


class PredictionEnsemble:
    """
    Weighted ensemble that fuses implicit and explicit model scores.

    Args:
        markov_model:   Fitted :class:`~models.implicit.markov.MarkovChain`.
        ngram_model:    Fitted :class:`~models.implicit.ngram.NgramModel`.
        lstm_trainer:   Trained :class:`~models.implicit.lstm_encoder.LSTMTrainer`.
        feedback_analyzer: Optional :class:`~models.explicit.sentiment.FeedbackAnalyzer`.
        weights:        Component weight dict.  Missing components get 0.
                        Weights are automatically normalised so they sum to 1.
        confidence_threshold: Minimum ensemble confidence before flagging for LLM fallback.
        absorption_target:   Absorption state representing drop-off in Markov model.

    Example::

        ensemble = PredictionEnsemble(
            markov_model=mc, ngram_model=ngm, lstm_trainer=trainer
        )
        result = ensemble.predict(["kyc_check", "doc_upload"])
    """

    def __init__(
        self,
        markov_model=None,
        ngram_model=None,
        lstm_trainer=None,
        feedback_analyzer=None,
        weights: Optional[Dict[str, float]] = None,
        confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
        absorption_target: str = "drop_off",
        interpreter=None,
        churn_conditionals: Optional[Dict[str, float]] = None,
        cooccurrence_matrix: Optional[pd.DataFrame] = None,
        taxonomy_map: Optional[Dict[str, Dict]] = None,
    ) -> None:
        self.markov_model = markov_model
        self.ngram_model = ngram_model
        self.lstm_trainer = lstm_trainer
        self.feedback_analyzer = feedback_analyzer
        self.confidence_threshold = confidence_threshold
        self.absorption_target = absorption_target
        
        # Interpretability components
        self.interpreter = interpreter
        self.churn_conditionals = churn_conditionals or {}
        self.cooccurrence_matrix = cooccurrence_matrix
        self.taxonomy_map = taxonomy_map or {}

        raw_weights = weights or DEFAULT_WEIGHTS
        total = sum(raw_weights.values()) or 1.0
        self.weights: Dict[str, float] = {k: v / total for k, v in raw_weights.items()}

    # ------------------------------------------------------------------
    # Single prediction
    # ------------------------------------------------------------------

    def predict(
        self,
        session_sequence: List[str],
        feedback_text: Optional[str] = None,
        rag_pipeline=None,
        session_events: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        """
        Run full ensemble prediction for one session.

        Individual model contributions:

        +----------+-----------------------------------------------------------------+
        | Source   | Score derivation                                                |
        +==========+=================================================================+
        | Markov   | ``absorption_probability(last_feature, drop_off)``              |
        +----------+-----------------------------------------------------------------+
        | N-gram   | ``min(perplexity / PERPLEXITY_MAX, 1.0)``                       |
        +----------+-----------------------------------------------------------------+
        | LSTM     | Direct `churn_probability` output                               |
        +----------+-----------------------------------------------------------------+
        | RAG      | ``churn_signal`` from :class:`FeedbackAnalyzer` on              |
        |          | ``feedback_text``; or RAG query on sequence-joined string        |
        +----------+-----------------------------------------------------------------+

        Ensemble confidence is computed as  ``1 - σ(model_scores)``, meaning
        higher agreement between models increases confidence.

        Args:
            session_sequence: Ordered list of L3 feature names for this session.
            feedback_text:    Optional free-text feedback from the user.
            rag_pipeline:     Optional :class:`FeatureRAGPipeline` instance for
                              retrieving relevant feedback context.

        Returns:
            Prediction dict with keys:
              ``churn_probability``, ``confidence``, ``dominant_signal``,
              ``feature_risk_map``, ``model_breakdown``, ``requires_llm_fallback``.

        Raises:
            ValueError: If ``session_sequence`` is empty.
        """
        if not session_sequence:
            raise ValueError("session_sequence must not be empty.")

        breakdown: Dict[str, Dict] = {}
        active_scores: Dict[str, float] = {}

        # ── Markov ────────────────────────────────────────────────────
        markov_score = 0.5
        top_friction = "N/A"
        feature_risk_map: Dict[str, float] = {}

        if self.markov_model is not None and self.markov_model.transition_matrix is not None:
            last_feature = session_sequence[-1]
            markov_score = self.markov_model.absorption_probability(
                last_feature, self.absorption_target
            )
            friction = self.markov_model.get_friction_features(threshold=0.0,
                                                                drop_off_state=self.absorption_target)
            feature_risk_map = {f["feature"]: f["drop_off_prob"] for f in friction}
            top_friction = friction[0]["feature"] if friction else "N/A"

        breakdown["markov"] = {"score": round(markov_score, 4), "top_friction": top_friction}
        if "markov" in self.weights and self.weights["markov"] > 0:
            active_scores["markov"] = markov_score

        # ── N-gram ────────────────────────────────────────────────────
        ngram_score = 0.5
        anomaly_flag = False

        if self.ngram_model is not None and self.ngram_model.vocab:
            try:
                perplexity = self.ngram_model.score_sequence(session_sequence)
                ngram_score = min(perplexity / PERPLEXITY_MAX, 1.0)
                anomaly_flag = ngram_score > 0.6
            except Exception as exc:
                logger.warning(f"N-gram scoring failed: {exc}")

        breakdown["ngram"] = {"score": round(ngram_score, 4), "anomaly_flag": anomaly_flag}
        if "ngram" in self.weights and self.weights["ngram"] > 0:
            active_scores["ngram"] = ngram_score

        # ── LSTM ─────────────────────────────────────────────────────
        lstm_score = 0.5
        session_embedding: List[float] = []

        if self.lstm_trainer is not None and self.lstm_trainer._vocab is not None:
            try:
                preds = self.lstm_trainer.predict([session_sequence])
                lstm_score = preds[0]["churn_probability"]
                session_embedding = preds[0]["session_embedding"]
            except Exception as exc:
                logger.warning(f"LSTM prediction failed: {exc}")

        breakdown["lstm"] = {
            "score": round(lstm_score, 4),
            "embedding": session_embedding[:8] if session_embedding else [],  # truncate for payload
        }
        if "lstm" in self.weights and self.weights["lstm"] > 0:
            active_scores["lstm"] = lstm_score

        # ── RAG / Sentiment ───────────────────────────────────────────
        rag_score = 0.5
        relevant_feedback = ""

        if feedback_text and self.feedback_analyzer is not None:
            try:
                analysis = self.feedback_analyzer.analyze(feedback_text)
                rag_score = analysis["churn_signal"]
                relevant_feedback = feedback_text[:120]
            except Exception as exc:
                logger.warning(f"Sentiment analysis failed: {exc}")
        elif rag_pipeline is not None:
            try:
                query_str = " ".join(session_sequence)
                hits = rag_pipeline.query(query_str, top_k=3)
                if hits:
                    churn_signals = [
                        float(h["metadata"].get("churn_signal", 0.5) or 0.5)
                        for h in hits
                    ]
                    rag_score = float(np.mean(churn_signals))
                    relevant_feedback = hits[0]["document"][:120]
            except Exception as exc:
                logger.warning(f"RAG query failed: {exc}")

        breakdown["rag"] = {"score": round(rag_score, 4), "relevant_feedback": relevant_feedback}
        if "rag" in self.weights and self.weights["rag"] > 0:
            active_scores["rag"] = rag_score

        # ── Weighted ensemble ─────────────────────────────────────────
        if not active_scores:
            churn_probability = 0.5
            confidence = 0.0
        else:
            weighted_sum = sum(
                self.weights.get(k, 0.0) * v for k, v in active_scores.items()
            )
            weight_total = sum(self.weights.get(k, 0.0) for k in active_scores)
            churn_probability = weighted_sum / weight_total if weight_total else 0.5

            scores_arr = np.array(list(active_scores.values()))
            std_dev = float(np.std(scores_arr))
            # Confidence: high when models agree (low σ) and we have many models
            model_coverage = len(active_scores) / max(len(self.weights), 1)
            confidence = round(float(np.clip((1.0 - std_dev) * model_coverage, 0.0, 1.0)), 4)

        # ── Dominant signal ───────────────────────────────────────────
        implicit_score = np.mean([active_scores.get("markov", 0.5),
                                   active_scores.get("ngram", 0.5),
                                   active_scores.get("lstm", 0.5)])
        explicit_score = active_scores.get("rag", 0.5)
        diff = abs(implicit_score - explicit_score)

        if diff < 0.1:
            dominant_signal = "ensemble"
        elif implicit_score > explicit_score:
            dominant_signal = "implicit"
        else:
            dominant_signal = "explicit"

        requires_llm_fallback = confidence < self.confidence_threshold

        result = {
            "churn_probability": round(float(churn_probability), 4),
            "confidence": confidence,
            "dominant_signal": dominant_signal,
            "feature_risk_map": feature_risk_map,
            "model_breakdown": breakdown,
            "requires_llm_fallback": requires_llm_fallback,
        }

        if self.interpreter is not None:
            try:
                result["interpretation"] = self.interpreter.interpret(
                    session_sequence=session_sequence,
                    ensemble_output=result,
                    markov=self.markov_model,
                    ngram=self.ngram_model,
                    churn_conditionals=self.churn_conditionals,
                    cooccurrence_matrix=self.cooccurrence_matrix,
                    taxonomy_map=self.taxonomy_map,
                    session_events=session_events,
                )
            except Exception as exc:
                logger.warning(f"Interpretability report failed: {exc}")

        return result

    # ------------------------------------------------------------------
    # Batch prediction
    # ------------------------------------------------------------------

    def batch_predict(
        self,
        sessions: List[List[str]],
        feedback_texts: Optional[List[Optional[str]]] = None,
    ) -> pd.DataFrame:
        """
        Run :meth:`predict` over a list of sessions and return a DataFrame.

        Args:
            sessions:       List of session sequences.
            feedback_texts: Optional aligned list of feedback strings.
                            ``None`` entries are skipped.

        Returns:
            DataFrame with one row per session containing all prediction
            fields as flattened columns.
        """
        if feedback_texts is None:
            feedback_texts = [None] * len(sessions)

        rows = []
        for seq, fb in zip(sessions, feedback_texts):
            try:
                result = self.predict(seq, feedback_text=fb)
            except Exception as exc:
                logger.error(f"Batch predict failed for sequence {seq}: {exc}")
                result = {
                    "churn_probability": None, "confidence": None,
                    "dominant_signal": None, "feature_risk_map": {},
                    "model_breakdown": {}, "requires_llm_fallback": True,
                }
            row = {
                "sequence": seq,
                "churn_probability": result["churn_probability"],
                "confidence": result["confidence"],
                "dominant_signal": result["dominant_signal"],
                "requires_llm_fallback": result["requires_llm_fallback"],
                "markov_score": result["model_breakdown"].get("markov", {}).get("score"),
                "ngram_score":  result["model_breakdown"].get("ngram",  {}).get("score"),
                "lstm_score":   result["model_breakdown"].get("lstm",   {}).get("score"),
                "rag_score":    result["model_breakdown"].get("rag",    {}).get("score"),
            }
            rows.append(row)

        return pd.DataFrame(rows)
