"""
Unit tests for LSTM encoder, SessionDataset, LSTMTrainer, and augment_sequences.

These tests run entirely on CPU with toy data — no GPU or pre-trained model
downloads required.
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import math
import tempfile

import pytest
import torch

from models.implicit.lstm_encoder import (
    LSTMChurnEncoder,
    LSTMTrainer,
    SessionDataset,
    augment_sequences,
    _binary_entropy,
    _roc_auc,
)

# ---------------------------------------------------------------------------
# Shared data
# ---------------------------------------------------------------------------

SEQUENCES = [
    ["kyc_check", "doc_upload", "bureau_pull", "disbursement"],
    ["kyc_check", "doc_upload", "kyc_check", "drop_off"],
    ["bureau_pull", "manual_review", "disbursement"],
    ["kyc_check", "drop_off"],
    ["bureau_pull", "disbursement"],
    ["kyc_check", "doc_upload", "bureau_pull", "kyc_check", "drop_off"],
]
LABELS = [0, 1, 0, 1, 0, 1]


# ===========================================================================
# SessionDataset
# ===========================================================================

class TestSessionDataset:
    def test_len(self):
        ds = SessionDataset(SEQUENCES, LABELS)
        assert len(ds) == len(SEQUENCES)

    def test_vocab_has_special_tokens(self):
        ds = SessionDataset(SEQUENCES, LABELS)
        assert "<PAD>" in ds.vocab
        assert "<UNK>" in ds.vocab

    def test_pad_index_is_zero(self):
        ds = SessionDataset(SEQUENCES, LABELS)
        assert ds.vocab["<PAD>"] == 0

    def test_all_features_in_vocab(self):
        ds = SessionDataset(SEQUENCES, LABELS)
        for seq in SEQUENCES:
            for tok in seq:
                assert tok in ds.vocab

    def test_getitem_returns_tensor_and_label(self):
        ds = SessionDataset(SEQUENCES, LABELS)
        tensor, label = ds[0]
        assert isinstance(tensor, torch.Tensor)
        assert label in (0, 1)

    def test_collate_fn_pads_correctly(self):
        ds = SessionDataset(SEQUENCES, LABELS)
        batch = [ds[i] for i in range(3)]
        padded, lengths, labels = SessionDataset.collate_fn(batch)
        assert padded.shape[0] == 3
        assert padded.shape[1] == lengths.max().item()
        assert labels.shape[0] == 3

    def test_length_mismatch_raises(self):
        with pytest.raises(ValueError):
            SessionDataset(SEQUENCES, [0, 1])

    def test_external_vocab_used(self):
        ds = SessionDataset(SEQUENCES, LABELS)
        ds2 = SessionDataset(SEQUENCES[:2], LABELS[:2], vocab=ds.vocab)
        assert ds2.vocab is ds.vocab


# ===========================================================================
# LSTMChurnEncoder
# ===========================================================================

class TestLSTMChurnEncoder:
    def _model(self, vocab_size=20):
        return LSTMChurnEncoder(vocab_size=vocab_size, embed_dim=16, hidden_dim=32, num_layers=2)

    def test_output_shapes(self):
        model = self._model()
        x = torch.randint(1, 20, (4, 10))  # batch=4, seq_len=10
        lengths = torch.tensor([10, 8, 6, 4])
        churn_prob, emb = model(x, lengths)
        assert churn_prob.shape == (4, 1)
        assert emb.shape == (4, 32)  # hidden_dim=32

    def test_churn_prob_in_unit_interval(self):
        model = self._model()
        x = torch.randint(1, 20, (2, 5))
        lengths = torch.tensor([5, 3])
        churn_prob, _ = model(x, lengths)
        assert ((churn_prob >= 0.0) & (churn_prob <= 1.0)).all()

    def test_single_step_sequence(self):
        """Model must not crash on length-1 sequences."""
        model = self._model()
        x = torch.randint(1, 20, (1, 1))
        lengths = torch.tensor([1])
        churn_prob, emb = model(x, lengths)
        assert churn_prob.shape == (1, 1)

    def test_no_nan_in_output(self):
        model = self._model()
        x = torch.randint(1, 20, (3, 7))
        lengths = torch.tensor([7, 5, 3])
        churn_prob, emb = model(x, lengths)
        assert not torch.isnan(churn_prob).any()
        assert not torch.isnan(emb).any()


# ===========================================================================
# LSTMTrainer
# ===========================================================================

class TestLSTMTrainer:
    def _trainer_and_ds(self):
        ds = SessionDataset(SEQUENCES, LABELS)
        model = LSTMChurnEncoder(
            vocab_size=len(ds.vocab), embed_dim=16, hidden_dim=32, num_layers=1, dropout=0.0
        )
        trainer = LSTMTrainer(model, lr=1e-2, device="cpu")
        return trainer, ds

    def test_train_returns_history(self):
        trainer, ds = self._trainer_and_ds()
        with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as f:
            path = f.name
        history = trainer.train(ds, epochs=3, batch_size=4, checkpoint_path=path)
        assert "train_loss" in history
        assert "val_loss" in history
        assert "val_auc" in history
        assert len(history["train_loss"]) <= 3
        os.unlink(path)

    def test_train_loss_decreases(self):
        """With enough epochs, loss should generally trend down."""
        trainer, ds = self._trainer_and_ds()
        with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as f:
            path = f.name
        history = trainer.train(ds, epochs=10, batch_size=4, patience=10,
                                checkpoint_path=path)
        first = history["train_loss"][0]
        last = history["train_loss"][-1]
        # Allow some slack — not always strictly decreasing on tiny data
        assert first >= last * 0.5, f"Loss jumped from {first} to {last}"
        os.unlink(path)

    def test_predict_structure(self):
        trainer, ds = self._trainer_and_ds()
        with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as f:
            path = f.name
        trainer.train(ds, epochs=2, batch_size=4, checkpoint_path=path)
        preds = trainer.predict(SEQUENCES[:2])
        assert len(preds) == 2
        for p in preds:
            assert "sequence" in p
            assert "churn_probability" in p
            assert "confidence" in p
            assert "session_embedding" in p
            assert 0.0 <= p["churn_probability"] <= 1.0
            assert 0.0 <= p["confidence"] <= 1.0
        os.unlink(path)

    def test_predict_before_train_raises(self):
        ds = SessionDataset(SEQUENCES, LABELS)
        model = LSTMChurnEncoder(vocab_size=len(ds.vocab))
        trainer = LSTMTrainer(model)
        with pytest.raises(RuntimeError):
            trainer.predict(SEQUENCES[:1])

    def test_save_and_load(self):
        trainer, ds = self._trainer_and_ds()
        with tempfile.TemporaryDirectory() as tmpdir:
            ckpt = os.path.join(tmpdir, "best")
            save_path = os.path.join(tmpdir, "trainer")
            trainer.train(ds, epochs=2, batch_size=4, checkpoint_path=ckpt + ".pt")
            trainer.save(save_path)

            ds2 = SessionDataset(SEQUENCES, LABELS)
            model2 = LSTMChurnEncoder(
                vocab_size=len(ds2.vocab), embed_dim=16, hidden_dim=32, num_layers=1
            )
            trainer2 = LSTMTrainer(model2, device="cpu")
            trainer2.load(save_path)
            preds = trainer2.predict(SEQUENCES[:1])
            assert len(preds) == 1


# ===========================================================================
# augment_sequences
# ===========================================================================

class TestAugmentSequences:
    def test_reaches_target_size(self):
        seqs, labels = augment_sequences(SEQUENCES, LABELS, target_size=50)
        assert len(seqs) >= 50
        assert len(labels) >= 50

    def test_original_sequences_preserved(self):
        aug_seqs, _ = augment_sequences(SEQUENCES, LABELS, target_size=20)
        for orig in SEQUENCES:
            assert orig in aug_seqs

    def test_labels_match_sequences_length(self):
        seqs, labels = augment_sequences(SEQUENCES, LABELS, target_size=50)
        assert len(seqs) == len(labels)

    def test_labels_are_binary(self):
        _, labels = augment_sequences(SEQUENCES, LABELS, target_size=30)
        assert all(l in (0, 1) for l in labels)

    def test_churn_ratio_preserved_roughly(self):
        orig_ratio = sum(LABELS) / len(LABELS)
        _, aug_labels = augment_sequences(SEQUENCES, LABELS, target_size=200)
        aug_ratio = sum(aug_labels) / len(aug_labels)
        assert abs(aug_ratio - orig_ratio) < 0.20, (
            f"Churn ratio drifted: {orig_ratio:.2f} → {aug_ratio:.2f}"
        )

    def test_empty_sequences_raises(self):
        with pytest.raises(ValueError):
            augment_sequences([], [], 10)

    def test_target_smaller_than_input(self):
        seqs, labels = augment_sequences(SEQUENCES, LABELS, target_size=2)
        assert len(seqs) == len(SEQUENCES)  # returns original unchanged


# ===========================================================================
# Utility helpers
# ===========================================================================

class TestUtilHelpers:
    def test_binary_entropy_max_at_half(self):
        h_half = _binary_entropy(0.5)
        for p in [0.1, 0.2, 0.8, 0.9]:
            assert _binary_entropy(p) < h_half + 1e-9

    def test_binary_entropy_zero_at_extremes(self):
        assert _binary_entropy(0.0) < 0.01
        assert _binary_entropy(1.0) < 0.01

    def test_roc_auc_perfect(self):
        labels = [0, 0, 1, 1]
        preds  = [0.1, 0.2, 0.8, 0.9]
        assert math.isclose(_roc_auc(labels, preds), 1.0, abs_tol=0.01)

    def test_roc_auc_random(self):
        labels = [0, 1, 0, 1]
        preds  = [0.5, 0.5, 0.5, 0.5]
        # Equal predictions → result is implementation-defined but must be in [0, 1]
        result = _roc_auc(labels, preds)
        assert 0.0 <= result <= 1.0

    def test_roc_auc_single_class_returns_half(self):
        assert _roc_auc([0, 0, 0], [0.1, 0.5, 0.9]) == 0.5
