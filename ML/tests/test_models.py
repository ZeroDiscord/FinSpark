"""
Unit tests for finspark-intelligence implicit models.

Tests cover:
  - NgramModel: fit, predict_next, score_sequence (perplexity), persistence
  - MarkovChain: fit, transition matrix validity, absorption probability,
                 friction feature detection, export
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import math
import tempfile

import pytest

# ---------------------------------------------------------------------------
# Shared toy dataset
# ---------------------------------------------------------------------------
SEQUENCES = [
    ["kyc_check", "doc_upload", "bureau_pull", "disbursement"],
    ["kyc_check", "doc_upload", "kyc_check", "drop_off"],
    ["bureau_pull", "manual_review", "disbursement"],
]
ABSORPTION_STATES = ["disbursement", "drop_off"]


# ==========================================================================
# NgramModel tests
# ==========================================================================

class TestNgramModel:
    def test_init_invalid_n(self):
        from models.implicit.ngram import NgramModel
        with pytest.raises(ValueError):
            NgramModel(n=0)

    def test_fit_populates_vocab(self):
        from models.implicit.ngram import NgramModel
        m = NgramModel(n=2)
        m.fit(SEQUENCES)
        expected = {"kyc_check", "doc_upload", "bureau_pull", "disbursement", "drop_off", "manual_review"}
        assert expected.issubset(m.vocab)

    def test_fit_populates_counts(self):
        from models.implicit.ngram import NgramModel
        m = NgramModel(n=2)
        m.fit(SEQUENCES)
        assert len(m.counts) > 0

    def test_predict_next_returns_top_k(self):
        from models.implicit.ngram import NgramModel
        m = NgramModel(n=2)
        m.fit(SEQUENCES)
        preds = m.predict_next(["kyc_check"], top_k=3)
        assert len(preds) == 3
        assert all(isinstance(f, str) and isinstance(p, float) for f, p in preds)

    def test_predict_next_probs_are_valid(self):
        from models.implicit.ngram import NgramModel
        m = NgramModel(n=2)
        m.fit(SEQUENCES)
        preds = m.predict_next(["kyc_check"], top_k=len(m.vocab))
        for _, prob in preds:
            assert 0.0 < prob <= 1.0

    def test_predict_next_sorted_descending(self):
        from models.implicit.ngram import NgramModel
        m = NgramModel(n=2)
        m.fit(SEQUENCES)
        preds = m.predict_next(["kyc_check"], top_k=5)
        probs = [p for _, p in preds]
        assert probs == sorted(probs, reverse=True)

    def test_predict_next_doc_upload_likely_after_kyc(self):
        """doc_upload follows kyc_check in 2/3 training sequences."""
        from models.implicit.ngram import NgramModel
        m = NgramModel(n=2)
        m.fit(SEQUENCES)
        preds = m.predict_next(["kyc_check"], top_k=3)
        top_features = [f for f, _ in preds]
        assert "doc_upload" in top_features

    def test_score_sequence_returns_float(self):
        from models.implicit.ngram import NgramModel
        m = NgramModel(n=2)
        m.fit(SEQUENCES)
        score = m.score_sequence(["kyc_check", "doc_upload", "disbursement"])
        assert isinstance(score, float)
        assert score >= 1.0  # perplexity >= 1

    def test_score_sequence_common_less_than_rare(self):
        """Common sequence should have lower perplexity than unseen sequence."""
        from models.implicit.ngram import NgramModel
        m = NgramModel(n=2)
        m.fit(SEQUENCES)
        common_score = m.score_sequence(["kyc_check", "doc_upload"])
        rare_score = m.score_sequence(["manual_review", "doc_upload", "disbursement",
                                        "manual_review", "drop_off"])
        assert common_score < rare_score

    def test_score_empty_raises(self):
        from models.implicit.ngram import NgramModel
        m = NgramModel(n=2)
        m.fit(SEQUENCES)
        with pytest.raises(ValueError):
            m.score_sequence([])

    def test_predict_next_invalid_top_k(self):
        from models.implicit.ngram import NgramModel
        m = NgramModel(n=2)
        m.fit(SEQUENCES)
        with pytest.raises(ValueError):
            m.predict_next(["kyc_check"], top_k=0)

    def test_save_and_load(self):
        from models.implicit.ngram import NgramModel
        m = NgramModel(n=2)
        m.fit(SEQUENCES)
        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f:
            path = f.name
        m.save(path)
        m2 = NgramModel.load(path)
        assert m2.vocab == m.vocab
        assert m2.n == m.n
        os.unlink(path)

    def test_trigram_model(self):
        """Test that trigram uses (n-1)=2 context tokens."""
        from models.implicit.ngram import NgramModel
        m = NgramModel(n=3)
        m.fit(SEQUENCES)
        preds = m.predict_next(["kyc_check", "doc_upload"], top_k=3)
        assert len(preds) > 0


# ==========================================================================
# MarkovChain tests
# ==========================================================================

class TestMarkovChain:
    def _fitted_model(self):
        from models.implicit.markov import MarkovChain
        mc = MarkovChain()
        mc.fit(SEQUENCES, absorption_states=ABSORPTION_STATES)
        return mc

    def test_fit_creates_transition_matrix(self):
        mc = self._fitted_model()
        assert mc.transition_matrix is not None

    def test_all_states_present(self):
        mc = self._fitted_model()
        expected = {"kyc_check", "doc_upload", "bureau_pull", "disbursement", "drop_off", "manual_review"}
        assert expected.issubset(set(mc.states))

    def test_transition_matrix_is_square(self):
        mc = self._fitted_model()
        tm = mc.transition_matrix
        assert tm.shape[0] == tm.shape[1]

    def test_transition_rows_sum_to_one(self):
        """Every non-absorbing row must sum to ~1.0 after Laplace smoothing."""
        mc = self._fitted_model()
        transient = [s for s in mc.states if s not in mc.absorption_states]
        for state in transient:
            row_sum = mc.transition_matrix.loc[state].sum()
            assert math.isclose(row_sum, 1.0, abs_tol=1e-9), \
                f"Row '{state}' sums to {row_sum}, expected 1.0"

    def test_absorption_probability_in_unit_interval(self):
        mc = self._fitted_model()
        for state in mc.states:
            for target in ABSORPTION_STATES:
                p = mc.absorption_probability(state, target)
                assert 0.0 <= p <= 1.0, f"P({target}|{state}) = {p}"

    def test_absorption_from_absorbing_state(self):
        """An absorbing state trivially reaches itself with P=1."""
        mc = self._fitted_model()
        assert mc.absorption_probability("disbursement", "disbursement") == 1.0

    def test_absorption_reach_disbursement_from_kyc(self):
        """kyc_check → doc_upload → bureau_pull → disbursement exists in training data."""
        mc = self._fitted_model()
        p = mc.absorption_probability("kyc_check", "disbursement")
        assert p > 0.0, "There should be a nonzero path to disbursement from kyc_check"

    def test_sum_absorption_probs_leq_one(self):
        """Sum of absorption probabilities across all absorbing states <= 1 for each transient state."""
        mc = self._fitted_model()
        transient = [s for s in mc.states if s not in mc.absorption_states]
        for state in transient:
            total = sum(mc.absorption_probability(state, a) for a in ABSORPTION_STATES)
            assert total <= 1.0 + 1e-9, f"Total absorption from '{state}' = {total}"

    def test_friction_features_returns_list(self):
        mc = self._fitted_model()
        friction = mc.get_friction_features(threshold=0.10, drop_off_state="drop_off")
        assert isinstance(friction, list)

    def test_friction_features_sorted_descending(self):
        mc = self._fitted_model()
        friction = mc.get_friction_features(threshold=0.0, drop_off_state="drop_off")
        probs = [f["drop_off_prob"] for f in friction]
        assert probs == sorted(probs, reverse=True)

    def test_friction_features_have_required_keys(self):
        mc = self._fitted_model()
        friction = mc.get_friction_features(threshold=0.0, drop_off_state="drop_off")
        for item in friction:
            assert "feature" in item
            assert "drop_off_prob" in item
            assert "strategic_implication" in item

    def test_unfitted_raises_runtime_error(self):
        from models.implicit.markov import MarkovChain
        mc = MarkovChain()
        with pytest.raises(RuntimeError):
            mc.absorption_probability("kyc_check", "drop_off")
        with pytest.raises(RuntimeError):
            mc.get_friction_features()
        with pytest.raises(RuntimeError):
            mc.export_transition_table()

    def test_export_transition_table(self):
        mc = self._fitted_model()
        df = mc.export_transition_table()
        import pandas as pd
        assert isinstance(df, pd.DataFrame)
        assert df.shape[0] == len(mc.states)

    def test_save_and_load(self):
        mc = self._fitted_model()
        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f:
            path = f.name
        mc.save(path)
        from models.implicit.markov import MarkovChain
        mc2 = MarkovChain.load(path)
        assert mc2.states == mc.states
        os.unlink(path)

    def test_fit_empty_sequences_raises(self):
        from models.implicit.markov import MarkovChain
        mc = MarkovChain()
        with pytest.raises(ValueError):
            mc.fit([])
