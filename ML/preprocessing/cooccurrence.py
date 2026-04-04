"""
Co-occurrence and Churn Conditional Analysis for Finspark Intelligence.

Provides:
  - Sliding-window co-occurrence matrix construction (conditional probabilities)
  - Per-feature empirical churn probability computation
"""

from __future__ import annotations

from collections import defaultdict
from typing import Dict, List

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Co-occurrence Matrix
# ---------------------------------------------------------------------------

def build_cooccurrence_matrix(
    sequences: List[List[str]],
    window: int = 3,
) -> pd.DataFrame:
    """
    Build a symmetric feature co-occurrence matrix using a sliding window,
    then normalise each row to obtain conditional probabilities
    ``P(feature_j | feature_i)``.

    Algorithm:
        For every position ``i`` in a sequence, pair ``sequences[i]`` with
        every ``sequences[j]`` where ``0 < |i - j| <= window``.
        Increment the count cell ``[feature_i, feature_j]`` and
        ``[feature_j, feature_i]`` by 1 (symmetric).
        After scanning all sequences, divide each row by its row sum so that
        ``matrix[i, :].sum() == 1`` (rows are proper probability distributions).

    Args:
        sequences: List of token sequences (output of
                   :func:`~preprocessing.session_builder.sessions_to_sequences`).
        window:    Number of surrounding positions to consider as co-occurring.
                   Must be >= 1.

    Returns:
        A square ``pd.DataFrame`` with features as both index and columns.
        Values represent ``P(col_feature | row_feature)``.
        Rows with zero counts (isolated features) remain as all-zeros rather
        than producing NaN.

    Raises:
        ValueError: If ``window < 1``.

    Example::

        seqs = [["kyc_check", "doc_upload", "bureau_pull", "disbursement"]]
        matrix = build_cooccurrence_matrix(seqs, window=2)
        print(matrix.loc["kyc_check"])  # conditional probs from kyc_check
    """
    if window < 1:
        raise ValueError(f"window must be >= 1, got {window}")

    # Collect all unique features across all sequences
    all_features = sorted({feat for seq in sequences for feat in seq})
    feature_idx = {f: i for i, f in enumerate(all_features)}
    n = len(all_features)

    counts = np.zeros((n, n), dtype=np.float64)

    for seq in sequences:
        length = len(seq)
        for i, feat_i in enumerate(seq):
            idx_i = feature_idx[feat_i]
            lo = max(0, i - window)
            hi = min(length - 1, i + window)
            for j in range(lo, hi + 1):
                if i == j:
                    continue
                idx_j = feature_idx[seq[j]]
                counts[idx_i, idx_j] += 1.0

    # Row-normalise to get P(j | i)
    row_sums = counts.sum(axis=1, keepdims=True)
    # Avoid division by zero for features that never co-occur
    safe_sums = np.where(row_sums == 0, 1.0, row_sums)
    conditional_probs = counts / safe_sums

    return pd.DataFrame(conditional_probs, index=all_features, columns=all_features)


# ---------------------------------------------------------------------------
# Churn Conditional Probability
# ---------------------------------------------------------------------------

def compute_churn_conditional(
    sequences: List[List[str]],
    churn_labels: List[int],
) -> Dict[str, float]:
    """
    Compute the empirical probability ``P(churn | feature_appears_in_session)``
    for every feature observed in the dataset.

    Method:
        For each feature ``f``:
          - ``n_sessions_with_f``    = number of sessions containing ``f`` at
                                       least once.
          - ``n_churned_with_f``     = sessions containing ``f`` AND labelled 1.
          - ``P(churn | f)``         = n_churned_with_f / n_sessions_with_f
        Features that never appear receive a probability of ``0.0``.

    Enhancement — Laplace / additive smoothing:
        A Laplace smoothing constant ``alpha = 0.5`` is applied to prevent
        division-by-zero artefacts and to shrink extreme probabilities for
        rare features toward the population churn rate.

    Args:
        sequences:    List of feature-token sequences, one per session (same
                      order as ``churn_labels``).
        churn_labels: Binary labels aligned with ``sequences``; 1 = churned/
                      dropped, 0 = completed.

    Returns:
        ``Dict[str, float]`` mapping each feature to its churn probability.

    Raises:
        ValueError: If ``len(sequences) != len(churn_labels)``.

    Example::

        seqs   = [["kyc_check", "drop_off"], ["kyc_check", "disbursement"]]
        labels = [1, 0]
        probs  = compute_churn_conditional(seqs, labels)
        # probs["drop_off"]  ~= 1.0
        # probs["kyc_check"] ~= 0.5
    """
    if len(sequences) != len(churn_labels):
        raise ValueError(
            f"sequences and churn_labels must have the same length; "
            f"got {len(sequences)} vs {len(churn_labels)}"
        )

    # Per-feature counts
    feature_session_count: Dict[str, int] = defaultdict(int)
    feature_churn_count: Dict[str, int] = defaultdict(int)

    for seq, label in zip(sequences, churn_labels):
        seen_in_session = set(seq)  # count each feature once per session
        for feat in seen_in_session:
            feature_session_count[feat] += 1
            if label == 1:
                feature_churn_count[feat] += 1

    # Population churn rate (for smoothing reference)
    total_sessions = len(sequences)
    total_churned = sum(churn_labels)
    population_churn_rate = total_churned / total_sessions if total_sessions else 0.0

    alpha = 0.5  # Laplace smoothing pseudo-count

    churn_probs: Dict[str, float] = {}
    for feat, n_sess in feature_session_count.items():
        n_churn = feature_churn_count.get(feat, 0)
        # Smoothed estimate: (churn_count + alpha) / (session_count + 2*alpha)
        churn_probs[feat] = (n_churn + alpha) / (n_sess + 2 * alpha)

    return churn_probs
