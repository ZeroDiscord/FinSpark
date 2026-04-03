"""
N-gram Language Model for Feature Sequence Modeling.

Models feature-usage sequences as an n-gram language model to:
  - Predict the most likely next feature given a context window
  - Score sequences via perplexity as an anomaly/churn signal

Higher perplexity → sequence is uncommon → stronger churn signal.
"""

from __future__ import annotations

import math
import pickle
from collections import Counter, defaultdict
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Type Aliases
# ---------------------------------------------------------------------------
ContextTuple = Tuple[str, ...]
Predictions = List[Tuple[str, float]]


class NgramModel:
    """
    N-gram language model over feature sequences.

    Attributes:
        n (int): The order of the n-gram (e.g. 3 = trigram).
        counts (defaultdict[ContextTuple, Counter]):
            Maps each (n-1)-length context tuple to a Counter of
            observed next-feature frequencies.
        vocab (set[str]): All unique features seen during training.
        _total_unigrams (int): Total token count for back-off / UNK handling.
    """

    def __init__(self, n: int = 3) -> None:
        """
        Initialise an empty NgramModel.

        Args:
            n: Order of the n-gram.  ``n=1`` → unigram, ``n=2`` → bigram,
               ``n=3`` → trigram (default).  Must be >= 1.

        Raises:
            ValueError: If ``n < 1``.
        """
        if n < 1:
            raise ValueError(f"n must be >= 1, got {n}")
        self.n: int = n
        self.counts: Dict[ContextTuple, Counter] = defaultdict(Counter)
        self.vocab: set = set()
        self._total_unigrams: int = 0

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    def fit(self, sequences: List[List[str]]) -> None:
        """
        Build n-gram frequency counts from all training sequences.

        Each sequence is padded with ``(n-1)`` ``<BOS>`` (beginning-of-
        sequence) tokens so the model can predict the very first feature
        conditioned on proper context.

        Args:
            sequences: List of feature-token sequences.  Each inner list
                       represents one user session.

        Example::

            model = NgramModel(n=3)
            model.fit([["kyc_check", "doc_upload", "disbursement"]])
        """
        self.counts = defaultdict(Counter)
        self.vocab = set()
        self._total_unigrams = 0

        for seq in sequences:
            # Add BOS padding so early tokens have full context
            padded = ["<BOS>"] * (self.n - 1) + list(seq)
            self.vocab.update(seq)
            self._total_unigrams += len(seq)

            for i in range(self.n - 1, len(padded)):
                context: ContextTuple = tuple(padded[i - (self.n - 1) : i])
                next_token: str = padded[i]
                self.counts[context][next_token] += 1

    # ------------------------------------------------------------------
    # Prediction
    # ------------------------------------------------------------------

    def predict_next(
        self,
        context: List[str],
        top_k: int = 3,
    ) -> Predictions:
        """
        Predict the top-k most likely next features given a context window.

        Uses add-1 (Laplace) smoothing with back-off to shorter n-grams when
        the exact context has never been seen during training.

        Args:
            context: The preceding feature tokens.  Only the last ``n-1``
                     tokens are used as the look-up key.
            top_k:   Number of candidates to return.

        Returns:
            List of ``(feature, probability)`` tuples sorted by probability
            descending.  Returns an empty list if the vocabulary is empty.

        Raises:
            ValueError: If ``top_k < 1``.
        """
        if top_k < 1:
            raise ValueError(f"top_k must be >= 1, got {top_k}")
        if not self.vocab:
            return []

        # Trim / pad context to exactly (n-1) tokens
        ctx_key: ContextTuple = tuple(context[-(self.n - 1):]) if self.n > 1 else ()

        # Back-off: try exact context first, then progressively shorter contexts
        counter = self._backoff_counter(ctx_key)

        # Laplace-smoothed probability over vocab
        vocab_size = len(self.vocab)
        totals = sum(counter.values()) + vocab_size  # denominator with smoothing

        probs: List[Tuple[str, float]] = []
        for feat in self.vocab:
            prob = (counter.get(feat, 0) + 1) / totals
            probs.append((feat, prob))

        probs.sort(key=lambda x: x[1], reverse=True)
        return probs[:top_k]

    def _backoff_counter(self, ctx_key: ContextTuple) -> Counter:
        """
        Retrieve the best available counter by progressively shortening the
        context (stupid back-off strategy).

        Args:
            ctx_key: The full (n-1)-length context tuple.

        Returns:
            The most specific Counter available, or an empty Counter.
        """
        # Try from longest to shortest context
        for length in range(len(ctx_key), -1, -1):
            key = ctx_key[-length:] if length > 0 else ()
            if key in self.counts:
                return self.counts[key]
        return Counter()

    # ------------------------------------------------------------------
    # Sequence Scoring
    # ------------------------------------------------------------------

    def score_sequence(self, sequence: List[str]) -> float:
        """
        Compute the (normalised) negative log-likelihood of a sequence,
        equivalent to per-token perplexity in nats.

        A **high score** indicates an unusual sequence (low probability
        under the model), which correlates with user confusion / churn risk.

        Formula::

            score = exp( -1/T * Σ log P(token_t | context_{t-1}) )

        where ``T`` is the sequence length and probabilities are Laplace-
        smoothed with back-off.

        Args:
            sequence: Feature token sequence to evaluate.

        Returns:
            Perplexity score ≥ 1.0.  An untrained model returns ``float('inf')``.

        Raises:
            ValueError: If the sequence is empty.
        """
        if not sequence:
            raise ValueError("Cannot score an empty sequence.")
        if not self.vocab:
            return float("inf")

        padded = ["<BOS>"] * (self.n - 1) + list(sequence)
        vocab_size = len(self.vocab)
        log_prob_sum = 0.0

        for i in range(self.n - 1, len(padded)):
            ctx_key: ContextTuple = tuple(padded[i - (self.n - 1) : i])
            token: str = padded[i]

            counter = self._backoff_counter(ctx_key)
            total = sum(counter.values()) + vocab_size  # Laplace denominator
            count = counter.get(token, 0) + 1           # Laplace numerator
            log_prob_sum += math.log(count / total)

        # Perplexity = exp(-average log probability)
        avg_log_prob = log_prob_sum / len(sequence)
        return math.exp(-avg_log_prob)

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, path: str) -> None:
        """
        Serialise the model to disk using pickle.

        Args:
            path: File path for the ``.pkl`` file (e.g. ``"models/ngram.pkl"``).
        """
        with open(path, "wb") as f:
            pickle.dump(self, f)

    @classmethod
    def load(cls, path: str) -> "NgramModel":
        """
        Deserialise a previously saved NgramModel from disk.

        Args:
            path: File path of the saved ``.pkl`` file.

        Returns:
            A reconstructed :class:`NgramModel` instance.
        """
        with open(path, "rb") as f:
            model = pickle.load(f)
        if not isinstance(model, cls):
            raise TypeError(f"Expected NgramModel, got {type(model)}")
        return model

    def __repr__(self) -> str:
        return (
            f"NgramModel(n={self.n}, "
            f"vocab_size={len(self.vocab)}, "
            f"contexts={len(self.counts)})"
        )
