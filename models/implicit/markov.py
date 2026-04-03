"""
Markov Chain Model for Feature Journey & Drop-off Analysis.

Models the user feature-usage journey as a discrete-time Markov chain:
  - States     → individual L3 features
  - Transitions → P(feature_j is visited next | currently at feature_i)
  - Absorption  → special terminal states (e.g. "disbursement", "drop_off")

Key analytical capabilities:
  1. Transition matrix construction & row-stochastic normalisation
  2. Absorption probability via the fundamental matrix method
     N = (I - Q)^{-1}   →   B = N · R
  3. Friction feature detection (high P(drop_off | feature))
"""

from __future__ import annotations

import pickle
from typing import Dict, List, Optional

import numpy as np
import pandas as pd


class MarkovChain:
    """
    Discrete first-order Markov Chain trained on feature-usage sequences.

    Attributes:
        transition_matrix (pd.DataFrame | None):
            Row-stochastic n×n matrix.  ``matrix.loc[A, B]`` = P(B | A).
        absorption_states (List[str]):
            Terminal states that once entered are never left (e.g. "drop_off").
        states (List[str]):
            All unique states (features) discovered during training, sorted.
        _raw_counts (pd.DataFrame | None):
            Raw transition counts before normalisation (retained for inspection).
    """

    def __init__(self) -> None:
        self.transition_matrix: Optional[pd.DataFrame] = None
        self.absorption_states: List[str] = []
        self.states: List[str] = []
        self._raw_counts: Optional[pd.DataFrame] = None

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    def fit(
        self,
        sequences: List[List[str]],
        absorption_states: Optional[List[str]] = None,
    ) -> None:
        """
        Build the row-stochastic transition probability matrix.

        For each consecutive pair ``(feature_i → feature_j)`` in a sequence,
        increment ``counts[feature_i, feature_j]`` by 1.  Absorption states are
        included as rows of all-zeros (they are terminal and emit no outgoing
        transitions) so that the mathematical structure is preserved correctly.

        Add-1 (Laplace) smoothing is applied **only** to non-absorption rows
        to avoid introducing artificial escape probabilities from terminal states.

        Args:
            sequences:         List of feature-token sequences.
            absorption_states: List of state names treated as absorbing/terminal.
                               Defaults to an empty list.

        Raises:
            ValueError: If ``sequences`` is empty.

        Example::

            mc = MarkovChain()
            mc.fit(
                sequences=[["kyc_check", "doc_upload", "disbursement"],
                           ["kyc_check", "drop_off"]],
                absorption_states=["disbursement", "drop_off"]
            )
        """
        if not sequences:
            raise ValueError("sequences must not be empty.")

        self.absorption_states = list(absorption_states or [])

        # Collect all states
        all_states = sorted({token for seq in sequences for token in seq})
        self.states = all_states

        n = len(all_states)
        idx = {s: i for i, s in enumerate(all_states)}

        raw = np.zeros((n, n), dtype=np.float64)

        for seq in sequences:
            for i in range(len(seq) - 1):
                src = seq[i]
                dst = seq[i + 1]
                raw[idx[src], idx[dst]] += 1.0

        # Laplace smoothing on transient (non-absorbing) rows only
        absorb_idx = {idx[s] for s in self.absorption_states if s in idx}
        for row_i in range(n):
            if row_i not in absorb_idx:
                raw[row_i] += 1.0  # +1 to every transition from this state

        # Row normalise → stochastic matrix
        row_sums = raw.sum(axis=1, keepdims=True)
        safe_sums = np.where(row_sums == 0.0, 1.0, row_sums)
        prob = raw / safe_sums

        self._raw_counts = pd.DataFrame(raw, index=all_states, columns=all_states)
        self.transition_matrix = pd.DataFrame(prob, index=all_states, columns=all_states)

    # ------------------------------------------------------------------
    # Absorption Probability (Fundamental Matrix Method)
    # ------------------------------------------------------------------

    def absorption_probability(
        self,
        start_feature: str,
        target_state: str,
    ) -> float:
        """
        Compute the probability of eventually reaching ``target_state``
        (an absorbing state) starting from ``start_feature`` using the
        **fundamental matrix method**:

        .. code-block:: text

            Partition states into transient (T) and absorbing (A) sets.

            Q  =  sub-matrix of transitions among transient states  [|T| × |T|]
            R  =  sub-matrix of transitions from transient → absorbing [|T| × |A|]

            Fundamental matrix:  N = (I - Q)^{-1}     [|T| × |T|]

            Absorption probability matrix:  B = N · R  [|T| × |A|]

            B[i, j] = P(eventually absorbed into state j | start at transient state i)

        Args:
            start_feature: A transient (non-absorbing) state.
            target_state:  An absorbing state whose absorption probability we want.

        Returns:
            Float in ``[0, 1]``.  Returns ``0.0`` if either state is unknown or if
            ``start_feature`` is itself absorbing.

        Raises:
            RuntimeError: If the model has not been fitted yet.

        Example::

            p = mc.absorption_probability("kyc_check", "disbursement")
            # → probability user completes from kyc_check
        """
        if self.transition_matrix is None:
            raise RuntimeError("Model must be fitted before calling absorption_probability.")

        if start_feature not in self.states or target_state not in self.states:
            return 0.0
        if start_feature in self.absorption_states:
            return 1.0 if start_feature == target_state else 0.0

        # Partition into transient and absorbing
        transient = [s for s in self.states if s not in self.absorption_states]
        absorbing = self.absorption_states

        if not transient or not absorbing:
            return 0.0
        if target_state not in absorbing:
            return 0.0

        T = self.transition_matrix

        # Q: transient → transient
        Q = T.loc[transient, transient].values.astype(np.float64)
        # R: transient → absorbing
        R = T.loc[transient, absorbing].values.astype(np.float64)

        # Fundamental matrix  N = (I - Q)^{-1}
        I = np.eye(len(transient))
        try:
            N = np.linalg.inv(I - Q)
        except np.linalg.LinAlgError:
            # Singular matrix — use least-squares approximation
            N, _, _, _ = np.linalg.lstsq(I - Q, np.eye(len(transient)), rcond=None)

        # B = N · R  — shape [|transient| × |absorbing|]
        B = N @ R

        t_idx = {s: i for i, s in enumerate(transient)}
        a_idx = {s: i for i, s in enumerate(absorbing)}

        if start_feature not in t_idx or target_state not in a_idx:
            return 0.0

        return float(np.clip(B[t_idx[start_feature], a_idx[target_state]], 0.0, 1.0))

    # ------------------------------------------------------------------
    # Friction Feature Detection
    # ------------------------------------------------------------------

    def get_friction_features(
        self,
        threshold: float = 0.20,
        drop_off_state: str = "drop_off",
    ) -> List[Dict]:
        """
        Identify transient features where ``P(drop_off | feature) > threshold``.

        Uses :meth:`absorption_probability` to compute the risk of each transient
        state leading to ``drop_off_state``.  States are annotated with a human-
        readable strategic implication to accelerate roadmap triage.

        Args:
            threshold:      Minimum drop-off probability to flag a feature.
                            Defaults to ``0.20`` (20 %).
            drop_off_state: The name of the absorbing drop-off/churn state.
                            Defaults to ``"drop_off"``.

        Returns:
            A list of dicts sorted by ``drop_off_prob`` descending::

                [
                    {
                        "feature": "manual_review",
                        "drop_off_prob": 0.54,
                        "strategic_implication": "HIGH friction – immediate UX ...
                    },
                    ...
                ]

        Raises:
            RuntimeError: If the model has not been fitted.
        """
        if self.transition_matrix is None:
            raise RuntimeError("Model must be fitted before calling get_friction_features.")

        transient = [s for s in self.states if s not in self.absorption_states]
        results = []

        for feat in transient:
            prob = self.absorption_probability(feat, drop_off_state)
            if prob >= threshold:
                results.append({
                    "feature": feat,
                    "drop_off_prob": round(prob, 4),
                    "strategic_implication": _strategic_label(prob),
                })

        results.sort(key=lambda x: x["drop_off_prob"], reverse=True)
        return results

    # ------------------------------------------------------------------
    # Export
    # ------------------------------------------------------------------

    def export_transition_table(self) -> pd.DataFrame:
        """
        Return the full transition probability matrix as a ``pd.DataFrame``
        suitable for dashboard display or further analysis.

        Returns:
            Row-stochastic ``pd.DataFrame`` where ``matrix.loc[A, B]`` = P(B|A).

        Raises:
            RuntimeError: If the model has not been fitted.
        """
        if self.transition_matrix is None:
            raise RuntimeError("Model must be fitted before exporting.")
        return self.transition_matrix.copy()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, path: str) -> None:
        """
        Serialise the model to disk.

        Args:
            path: Destination file path (e.g. ``"models/markov.pkl"``).
        """
        with open(path, "wb") as f:
            pickle.dump(self, f)

    @classmethod
    def load(cls, path: str) -> "MarkovChain":
        """
        Load a previously saved :class:`MarkovChain` from disk.

        Args:
            path: File path of the serialised model.

        Returns:
            A reconstructed :class:`MarkovChain` instance.
        """
        with open(path, "rb") as f:
            model = pickle.load(f)
        if not isinstance(model, cls):
            raise TypeError(f"Expected MarkovChain, got {type(model)}")
        return model

    # ------------------------------------------------------------------
    # Dunder helpers
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        fitted = self.transition_matrix is not None
        return (
            f"MarkovChain(states={len(self.states)}, "
            f"absorbing={self.absorption_states}, "
            f"fitted={fitted})"
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strategic_label(prob: float) -> str:
    """
    Map a drop-off probability to a human-readable strategic implication.

    Args:
        prob: Drop-off probability in [0, 1].

    Returns:
        Descriptive string for product/roadmap teams.
    """
    if prob >= 0.60:
        return (
            "CRITICAL friction – users abandon here most of the time. "
            "Immediate simplification or step removal recommended."
        )
    elif prob >= 0.40:
        return (
            "HIGH friction – significant drop-off risk. "
            "UX redesign, inline help, or automation should be prioritised."
        )
    elif prob >= 0.20:
        return (
            "MODERATE friction – notable drop-off signal. "
            "Monitor closely; A/B test improvements in next sprint."
        )
    else:
        return "LOW friction – below threshold, no immediate action required."
