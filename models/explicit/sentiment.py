"""
Sentiment Analysis and Feedback Processing for Finspark Intelligence.

Uses a pre-trained DistilBERT sentiment model from HuggingFace to score
user feedback text and extract actionable churn signals.

Key capabilities:
  - Sentiment classification (positive / neutral / negative) with a [-1, 1] score
  - Urgency keyword detection that boosts the churn signal
  - Fuzzy L3 feature-taxonomy mention extraction via difflib
  - Batch processing of CSV/Excel feedback files (returns enriched DataFrame)
"""

from __future__ import annotations

import re
from difflib import get_close_matches
from typing import Dict, List, Optional

import pandas as pd

# Lazy-load heavy deps to avoid import-time cost in test environments
_pipeline = None


def _get_pipeline():
    """Lazy-load the HuggingFace sentiment pipeline (cached after first call)."""
    global _pipeline
    if _pipeline is None:
        from transformers import pipeline as hf_pipeline
        _pipeline = hf_pipeline(
            "sentiment-analysis",
            model="distilbert-base-uncased-finetuned-sst-2-english",
            truncation=True,
            max_length=512,
        )
    return _pipeline


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

URGENCY_KEYWORDS: List[str] = [
    "broken", "slow", "useless", "cancel", "stop", "error",
    "can't", "cannot", "never works", "terrible", "awful",
    "frustrated", "crash", "freeze", "fail", "unusable",
]

_URGENCY_WEIGHT = 0.25  # each keyword adds this much to raw churn signal (capped at 1.0)


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------

class FeedbackAnalyzer:
    """
    Analyses free-text user feedback to derive:
      - Sentiment (positive / neutral / negative) with a continuous score [-1, 1]
      - Urgency keywords from a curated bank
      - L3 feature mentions via fuzzy matching against a taxonomy
      - A composite churn signal score [0, 1]

    Args:
        feature_taxonomy: Optional list of L3 feature names used for fuzzy
                          mention extraction.  Can also be set / updated later
                          via :attr:`feature_taxonomy`.
        urgency_threshold: Fuzzy-match similarity cutoff for urgency.
                           Defaults to ``0.75``.
        feature_match_cutoff: Similarity cutoff for feature fuzzy matching.
                              Defaults to ``0.70``.

    Example::

        analyzer = FeedbackAnalyzer(feature_taxonomy=["kyc_check", "doc_upload"])
        result = analyzer.analyze("The KYC check is broken and very slow!")
    """

    def __init__(
        self,
        feature_taxonomy: Optional[List[str]] = None,
        urgency_threshold: float = 0.75,
        feature_match_cutoff: float = 0.70,
    ) -> None:
        self.feature_taxonomy: List[str] = feature_taxonomy or []
        self.urgency_threshold = urgency_threshold
        self.feature_match_cutoff = feature_match_cutoff

    # ------------------------------------------------------------------
    # Core analysis
    # ------------------------------------------------------------------

    def analyze(self, feedback_text: str) -> Dict:
        """
        Analyse a single feedback string and return a structured result.

        Sentiment mapping:
          - HuggingFace ``POSITIVE`` label → score in (0, 1]  →  mapped to [0, 1]
          - HuggingFace ``NEGATIVE`` label → score in (0, 1]  →  mapped to [-1, 0)
          - If absolute score < 0.15 the label is overridden to ``"neutral"``

        Churn signal formula::

            base = abs(normalised_score) if sentiment == "negative" else 0
            urgency_boost = min(num_urgency_keywords × 0.25, 0.6)
            churn_signal = min(base + urgency_boost, 1.0)

        Args:
            feedback_text: Raw English feedback string from a user.

        Returns:
            Dict with keys: ``sentiment``, ``score``, ``feature_mentions``,
            ``churn_signal``, ``urgency_keywords``.

        Raises:
            ValueError: If ``feedback_text`` is empty or not a string.
        """
        if not feedback_text or not isinstance(feedback_text, str):
            raise ValueError("feedback_text must be a non-empty string.")

        pipe = _get_pipeline()

        # --- HuggingFace inference ---
        result = pipe(feedback_text)[0]
        label: str = result["label"]       # "POSITIVE" | "NEGATIVE"
        confidence: float = result["score"]  # 0 → 1

        # Map to [-1, 1]
        if label == "POSITIVE":
            normalised_score = confidence
        else:
            normalised_score = -confidence

        # Neutral band
        if abs(normalised_score) < 0.15:
            sentiment = "neutral"
        elif normalised_score > 0:
            sentiment = "positive"
        else:
            sentiment = "negative"

        # --- Urgency keyword detection ---
        text_lower = feedback_text.lower()
        found_urgency = [kw for kw in URGENCY_KEYWORDS if kw in text_lower]

        # --- Feature mention extraction ---
        words = re.findall(r"[a-zA-Z_]+", text_lower)
        word_phrases = words + [" ".join(words[i:i+2]) for i in range(len(words)-1)]
        feature_mentions: List[str] = []
        if self.feature_taxonomy:
            for phrase in set(word_phrases):
                matches = get_close_matches(
                    phrase, self.feature_taxonomy, n=1, cutoff=self.feature_match_cutoff
                )
                if matches:
                    feature_mentions.extend(matches)
            feature_mentions = list(dict.fromkeys(feature_mentions))  # dedup, preserve order

        # --- Churn signal ---
        base_churn = abs(normalised_score) if sentiment == "negative" else 0.0
        urgency_boost = min(len(found_urgency) * _URGENCY_WEIGHT, 0.6)
        churn_signal = round(min(base_churn + urgency_boost, 1.0), 4)

        return {
            "sentiment": sentiment,
            "score": round(normalised_score, 4),
            "feature_mentions": feature_mentions,
            "churn_signal": churn_signal,
            "urgency_keywords": found_urgency,
        }

    # ------------------------------------------------------------------
    # Batch processing
    # ------------------------------------------------------------------

    def analyze_batch(
        self,
        df: pd.DataFrame,
        text_col: str,
        feature_col: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Process a DataFrame of user feedback and append sentiment columns.

        New columns added to the returned DataFrame:
          - ``sentiment``         : "positive" | "neutral" | "negative"
          - ``sentiment_score``   : float in [-1, 1]
          - ``feature_mentions``  : comma-separated L3 features detected
          - ``churn_signal``      : float in [0, 1]
          - ``urgency_keywords``  : comma-separated urgency terms found

        Args:
            df:          Input DataFrame (from CSV or Excel upload).
            text_col:    Name of the column containing feedback text.
            feature_col: Optional column with pre-labelled feature names;
                         used to extend or validate ``feature_taxonomy``
                         on-the-fly for each row.

        Returns:
            A copy of ``df`` enriched with the above columns.

        Raises:
            KeyError: If ``text_col`` is not present in ``df``.
        """
        if text_col not in df.columns:
            raise KeyError(f"Column '{text_col}' not found in DataFrame.")

        results = []
        for _, row in df.iterrows():
            text = str(row[text_col]) if pd.notna(row[text_col]) else ""
            # Optionally extend taxonomy per-row with the provided feature label
            if feature_col and feature_col in df.columns and pd.notna(row.get(feature_col)):
                row_feature = str(row[feature_col])
                if row_feature not in self.feature_taxonomy:
                    self.feature_taxonomy.append(row_feature)
            try:
                analysis = self.analyze(text) if text else {
                    "sentiment": "neutral", "score": 0.0,
                    "feature_mentions": [], "churn_signal": 0.0, "urgency_keywords": []
                }
            except Exception:
                analysis = {
                    "sentiment": "neutral", "score": 0.0,
                    "feature_mentions": [], "churn_signal": 0.0, "urgency_keywords": []
                }
            results.append(analysis)

        enriched = df.copy()
        enriched["sentiment"] = [r["sentiment"] for r in results]
        enriched["sentiment_score"] = [r["score"] for r in results]
        enriched["feature_mentions"] = [", ".join(r["feature_mentions"]) for r in results]
        enriched["churn_signal"] = [r["churn_signal"] for r in results]
        enriched["urgency_keywords"] = [", ".join(r["urgency_keywords"]) for r in results]

        return enriched
