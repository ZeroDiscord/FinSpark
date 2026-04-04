"""
Unit tests for finspark-intelligence preprocessing pipeline.

Tests cover:
  - pii_masker: hash determinism, field hashing, regex redaction
  - session_builder: gap splitting, deterministic IDs, sequence extraction
  - cooccurrence: matrix shape/symmetry/normalisation, churn probabilities
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import math
from datetime import datetime, timezone, timedelta

import pytest

# --------------------------------------------------------------------------
# Fixtures / helpers
# --------------------------------------------------------------------------

def make_event(**kwargs):
    """Helper – returns a minimal FeatureEvent-compatible dict."""
    defaults = {
        "tenant_id": "tenant_a",
        "session_id": "sess_01",
        "user_id": "user_xyz",
        "timestamp": datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
        "deployment_type": "cloud",
        "channel": "web",
        "l1_domain": "origination",
        "l2_module": "kyc_engine",
        "l3_feature": "kyc_check",
        "l4_action": "submit",
        "l5_deployment_node": "aws-us-east-1",
        "duration_ms": 200,
        "success": True,
        "metadata": {},
    }
    defaults.update(kwargs)
    return defaults


def make_feature_event(**kwargs):
    """Helper – returns a FeatureEvent Pydantic model instance."""
    from preprocessing.schema import FeatureEvent
    return FeatureEvent(**make_event(**kwargs))


# ==========================================================================
# pii_masker tests
# ==========================================================================

class TestPIIMasker:
    def test_hash_id_is_deterministic(self):
        from preprocessing.pii_masker import hash_id
        assert hash_id("abc") == hash_id("abc")

    def test_hash_id_is_hex_64_chars(self):
        from preprocessing.pii_masker import hash_id
        result = hash_id("test_value")
        assert len(result) == 64
        int(result, 16)  # should not raise

    def test_hash_id_different_salts_differ(self, monkeypatch):
        import preprocessing.pii_masker as m
        monkeypatch.setattr(m, "SALT", "salt_a")
        h1 = m.hash_id("user1")
        monkeypatch.setattr(m, "SALT", "salt_b")
        h2 = m.hash_id("user1")
        assert h1 != h2

    def test_mask_event_hashes_identity_fields(self):
        from preprocessing.pii_masker import mask_event, hash_id
        raw = make_event()
        masked = mask_event(raw)
        assert masked["user_id"] == hash_id("user_xyz")
        assert masked["session_id"] == hash_id("sess_01")
        assert masked["tenant_id"] == hash_id("tenant_a")

    def test_mask_event_does_not_mutate_original(self):
        from preprocessing.pii_masker import mask_event
        raw = make_event()
        original_uid = raw["user_id"]
        mask_event(raw)
        assert raw["user_id"] == original_uid

    def test_mask_event_redacts_email(self):
        from preprocessing.pii_masker import mask_event
        raw = make_event(metadata={"contact": "john.doe@example.com"})
        masked = mask_event(raw)
        assert "[EMAIL_REDACTED]" in masked["metadata"]["contact"]

    def test_mask_event_redacts_phone(self):
        from preprocessing.pii_masker import mask_event
        raw = make_event(metadata={"phone": "9876543210"})
        masked = mask_event(raw)
        assert "[PHONE_REDACTED]" in masked["metadata"]["phone"]

    def test_mask_event_redacts_pan(self):
        from preprocessing.pii_masker import mask_event
        raw = make_event(metadata={"id": "ABCDE1234F"})
        masked = mask_event(raw)
        assert "[PAN_REDACTED]" in masked["metadata"]["id"]

    def test_mask_event_redacts_credit_card(self):
        from preprocessing.pii_masker import mask_event
        raw = make_event(metadata={"card": "1234 5678 9012 3456"})
        masked = mask_event(raw)
        assert "[CC_REDACTED]" in masked["metadata"]["card"]

    def test_mask_event_preserves_non_pii_metadata(self):
        from preprocessing.pii_masker import mask_event
        raw = make_event(metadata={"step": "upload", "retry": 2})
        masked = mask_event(raw)
        assert masked["metadata"]["step"] == "upload"
        assert masked["metadata"]["retry"] == 2


# ==========================================================================
# session_builder tests
# ==========================================================================

class TestSessionBuilder:
    def _events(self):
        """4 events: 2 for user_A (close together), 2 for user_A (gap > 30min), 1 for user_B"""
        t0 = datetime(2024, 1, 1, 9, 0, tzinfo=timezone.utc)
        return [
            make_feature_event(user_id="A", timestamp=t0, l3_feature="kyc_check"),
            make_feature_event(user_id="A", timestamp=t0 + timedelta(minutes=10), l3_feature="doc_upload"),
            make_feature_event(user_id="A", timestamp=t0 + timedelta(minutes=50), l3_feature="bureau_pull"),
            make_feature_event(user_id="A", timestamp=t0 + timedelta(minutes=55), l3_feature="disbursement"),
            make_feature_event(user_id="B", timestamp=t0, l3_feature="drop_off"),
        ]

    def test_correct_number_of_sessions(self):
        from preprocessing.session_builder import build_sessions
        sessions = build_sessions(self._events(), gap_minutes=30)
        # user A → 2 sessions; user B → 1 session → total 3
        assert len(sessions) == 3

    def test_sessions_are_ordered_by_timestamp(self):
        from preprocessing.session_builder import build_sessions
        events = self._events()
        sessions = build_sessions(events, gap_minutes=30)
        for session in sessions:
            timestamps = [e.timestamp for e in session]
            assert timestamps == sorted(timestamps)

    def test_deterministic_session_id(self):
        from preprocessing.session_builder import build_sessions
        sessions = build_sessions(self._events(), gap_minutes=30)
        for session in sessions:
            ids = {e.session_id for e in session}
            assert len(ids) == 1, "All events in a session must share the same session_id"

    def test_same_input_same_session_ids(self):
        from preprocessing.session_builder import build_sessions
        s1 = build_sessions(self._events(), gap_minutes=30)
        s2 = build_sessions(self._events(), gap_minutes=30)
        ids1 = sorted(sess[0].session_id for sess in s1)
        ids2 = sorted(sess[0].session_id for sess in s2)
        assert ids1 == ids2

    def test_sessions_to_sequences(self):
        from preprocessing.session_builder import build_sessions, sessions_to_sequences
        sessions = build_sessions(self._events(), gap_minutes=30)
        seqs = sessions_to_sequences(sessions)
        all_tokens = [tok for seq in seqs for tok in seq]
        assert "kyc_check" in all_tokens
        assert "disbursement" in all_tokens

    def test_empty_l3_feature_skipped(self):
        from preprocessing.session_builder import sessions_to_sequences
        from preprocessing.schema import FeatureEvent
        t0 = datetime(2024, 1, 1, tzinfo=timezone.utc)
        events = [
            make_feature_event(l3_feature="valid_feature"),
            make_feature_event(l3_feature=""),
        ]
        seqs = sessions_to_sequences([[events[0], events[1]]])
        assert seqs == [["valid_feature"]]


# ==========================================================================
# cooccurrence tests
# ==========================================================================

TOY_SEQUENCES = [
    ["kyc_check", "doc_upload", "bureau_pull", "disbursement"],
    ["kyc_check", "doc_upload", "kyc_check", "drop_off"],
    ["bureau_pull", "manual_review", "disbursement"],
]

CHURN_LABELS = [0, 1, 0]


class TestCooccurrence:
    def test_matrix_shape_is_square(self):
        from preprocessing.cooccurrence import build_cooccurrence_matrix
        mat = build_cooccurrence_matrix(TOY_SEQUENCES, window=2)
        assert mat.shape[0] == mat.shape[1]

    def test_matrix_index_equals_columns(self):
        from preprocessing.cooccurrence import build_cooccurrence_matrix
        mat = build_cooccurrence_matrix(TOY_SEQUENCES, window=2)
        assert list(mat.index) == list(mat.columns)

    def test_rows_sum_to_one_or_zero(self):
        from preprocessing.cooccurrence import build_cooccurrence_matrix
        mat = build_cooccurrence_matrix(TOY_SEQUENCES, window=2)
        for feat in mat.index:
            s = mat.loc[feat].sum()
            assert math.isclose(s, 1.0, abs_tol=1e-9) or math.isclose(s, 0.0, abs_tol=1e-9)

    def test_known_cooccurrence(self):
        """kyc_check and doc_upload always appear together → high conditional prob."""
        from preprocessing.cooccurrence import build_cooccurrence_matrix
        mat = build_cooccurrence_matrix(TOY_SEQUENCES, window=2)
        val = mat.loc["kyc_check", "doc_upload"]
        assert val > 0.0

    def test_invalid_window_raises(self):
        from preprocessing.cooccurrence import build_cooccurrence_matrix
        with pytest.raises(ValueError):
            build_cooccurrence_matrix(TOY_SEQUENCES, window=0)

    def test_churn_conditional_keys(self):
        from preprocessing.cooccurrence import compute_churn_conditional
        probs = compute_churn_conditional(TOY_SEQUENCES, CHURN_LABELS)
        all_feats = {f for seq in TOY_SEQUENCES for f in seq}
        assert set(probs.keys()) == all_feats

    def test_churn_prob_in_unit_interval(self):
        from preprocessing.cooccurrence import compute_churn_conditional
        probs = compute_churn_conditional(TOY_SEQUENCES, CHURN_LABELS)
        for feat, p in probs.items():
            assert 0.0 <= p <= 1.0, f"{feat}: {p} not in [0,1]"

    def test_churn_conditional_drop_off_higher_than_disbursement(self):
        """drop_off appears only in churn sessions; disbursement only in non-churn."""
        from preprocessing.cooccurrence import compute_churn_conditional
        probs = compute_churn_conditional(TOY_SEQUENCES, CHURN_LABELS)
        assert probs["drop_off"] > probs["disbursement"]

    def test_churn_length_mismatch_raises(self):
        from preprocessing.cooccurrence import compute_churn_conditional
        with pytest.raises(ValueError):
            compute_churn_conditional(TOY_SEQUENCES, [0, 1])  # wrong length
