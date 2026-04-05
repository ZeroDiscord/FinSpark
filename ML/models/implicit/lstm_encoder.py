"""
LSTM-based Churn Encoder for Feature Sequence Modeling.

Architecture:
  Embedding → BiLSTM (packed) → Mean-Pool → Dropout → Linear → Sigmoid

Includes:
  - LSTMChurnEncoder  : PyTorch nn.Module
  - SessionDataset    : Dataset with vocabulary building and padded collation
  - LSTMTrainer       : Training loop + early stopping + checkpointing
  - augment_sequences : Cold-start synthetic data augmentation (3 strategies)
"""

from __future__ import annotations

import math
import os
import pickle
import random
from collections import Counter
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
from torch import Tensor
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence, pad_sequence
from torch.optim import Adam
from torch.utils.data import DataLoader, Dataset, random_split


# ===========================================================================
# LSTMChurnEncoder
# ===========================================================================

class LSTMChurnEncoder(nn.Module):
    """
    Bidirectional LSTM that encodes a variable-length feature sequence into:
      - A session embedding vector  (Tensor of shape [batch, hidden_dim])
      - A churn probability scalar  (Tensor of shape [batch, 1])

    Architecture::

        Input indices [B, T]
          ↓ Embedding [B, T, embed_dim]
          ↓ Pack padded sequence
          ↓ BiLSTM × num_layers  [B, T, 2*hidden_dim]
          ↓ Unpack + mean-pool over valid steps [B, 2*hidden_dim]
          ↓ Dropout
          ↓ Linear(2*hidden_dim, hidden_dim) + ReLU
          ↓ Dropout
          ↓ Linear(hidden_dim, 1) + Sigmoid → churn_prob
                                   ↑
                              session_embedding (pre-sigmoid hidden)

    Args:
        vocab_size:  Size of the feature vocabulary (including ``<PAD>`` and ``<UNK>``).
        embed_dim:   Embedding dimension.  Defaults to 64.
        hidden_dim:  LSTM hidden state dimension (per direction).  Defaults to 128.
        num_layers:  Number of LSTM layers.  Defaults to 2.
        dropout:     Dropout probability applied between layers and before output.
                     Defaults to 0.3.
    """

    def __init__(
        self,
        vocab_size: int,
        embed_dim: int = 16,
        hidden_dim: int = 32,
        num_layers: int = 1,
        dropout: float = 0.5,
    ) -> None:
        super().__init__()
        self.embed_dim = embed_dim
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.bidirectional = True
        factor = 2 if self.bidirectional else 1

        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)

        self.lstm = nn.LSTM(
            input_size=embed_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
            bidirectional=self.bidirectional,
        )

        self.dropout = nn.Dropout(dropout)
        self.fc1 = nn.Linear(hidden_dim * factor, hidden_dim)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(hidden_dim, 1)
        self.sigmoid = nn.Sigmoid()

        # Weight initialisation
        for name, param in self.named_parameters():
            if "weight_ih" in name:
                nn.init.xavier_uniform_(param.data)
            elif "weight_hh" in name:
                nn.init.orthogonal_(param.data)
            elif "bias" in name:
                param.data.fill_(0)

    def forward(self, x: Tensor, lengths: Tensor) -> Tuple[Tensor, Tensor]:
        """
        Forward pass.

        Args:
            x:       Padded token index tensor of shape ``[batch, max_len]``.
            lengths: 1-D tensor of actual sequence lengths (before padding),
                     shape ``[batch]``.  Used to mask padded positions during
                     mean-pooling.

        Returns:
            Tuple of:
              - ``churn_prob``      : Tensor ``[batch, 1]``, values in (0, 1).
              - ``session_embedding``: Tensor ``[batch, hidden_dim]``, the
                                      intermediate representation before the
                                      final linear head.
        """
        # [B, T, E]
        embedded = self.embedding(x)

        # Pack → LSTM → unpack
        packed = pack_padded_sequence(
            embedded, lengths.cpu(), batch_first=True, enforce_sorted=False
        )
        packed_output, _ = self.lstm(packed)
        output, _ = pad_packed_sequence(packed_output, batch_first=True)
        # output: [B, T, 2*H]

        # Masked mean-pool over valid time steps
        mask = torch.arange(output.size(1), device=x.device).unsqueeze(0) < lengths.unsqueeze(1)
        mask = mask.unsqueeze(-1).float()  # [B, T, 1]
        pooled = (output * mask).sum(dim=1) / lengths.float().unsqueeze(1)  # [B, 2*H]

        # MLP head
        z = self.dropout(pooled)
        z = self.relu(self.fc1(z))           # [B, H]  → session embedding
        session_embedding = z
        z = self.dropout(z)
        churn_prob = self.sigmoid(self.fc2(z))  # [B, 1]

        return churn_prob, session_embedding


# ===========================================================================
# SessionDataset
# ===========================================================================

class SessionDataset(Dataset):
    """
    Dataset that converts List[List[str]] sequences to padded index tensors.

    Vocabulary special tokens:
      - ``<PAD>`` → index 0  (padding index, masked during training)
      - ``<UNK>`` → index 1  (out-of-vocabulary token)

    Attributes:
        vocab (Dict[str, int]): Token → index mapping.
        idx2token (Dict[int, str]): Index → token mapping.

    Args:
        sequences:    List of feature-name sequences (one per session).
        labels:       Binary churn labels aligned with sequences (0 or 1).
        vocab:        Optional pre-built vocabulary; if ``None``, built from data.
        min_freq:     Minimum token frequency to include in vocabulary.

    Raises:
        ValueError: If ``len(sequences) != len(labels)``.
    """

    PAD_TOKEN = "<PAD>"
    UNK_TOKEN = "<UNK>"

    def __init__(
        self,
        sequences: List[List[str]],
        labels: List[int],
        vocab: Optional[Dict[str, int]] = None,
        min_freq: int = 1,
    ) -> None:
        if len(sequences) != len(labels):
            raise ValueError(
                f"sequences and labels must have equal length; "
                f"got {len(sequences)} vs {len(labels)}"
            )

        self.labels = [int(l) for l in labels]
        self.raw_sequences = sequences

        if vocab is not None:
            self.vocab = vocab
        else:
            self.vocab = self._build_vocab(sequences, min_freq)

        self.idx2token = {i: t for t, i in self.vocab.items()}

        # Convert sequences to index tensors
        self.tensors = [self._encode(seq) for seq in sequences]

    def _build_vocab(self, sequences: List[List[str]], min_freq: int) -> Dict[str, int]:
        freq: Counter = Counter(tok for seq in sequences for tok in seq)
        vocab = {self.PAD_TOKEN: 0, self.UNK_TOKEN: 1}
        for tok, cnt in sorted(freq.items()):
            if cnt >= min_freq:
                vocab[tok] = len(vocab)
        return vocab

    def _encode(self, sequence: List[str]) -> Tensor:
        unk_idx = self.vocab[self.UNK_TOKEN]
        return torch.tensor([self.vocab.get(t, unk_idx) for t in sequence], dtype=torch.long)

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, idx: int) -> Tuple[Tensor, int]:
        return self.tensors[idx], self.labels[idx]

    @staticmethod
    def collate_fn(batch: List[Tuple[Tensor, int]]) -> Tuple[Tensor, Tensor, Tensor]:
        """
        Collate variable-length sequences into a padded batch.

        Returns:
            Tuple of:
              - padded tensor ``[batch, max_len]``
              - lengths tensor  ``[batch]``
              - labels tensor   ``[batch]``
        """
        seqs, lbls = zip(*batch)
        lengths = torch.tensor([len(s) for s in seqs], dtype=torch.long)
        padded = pad_sequence(seqs, batch_first=True, padding_value=0)
        labels = torch.tensor(lbls, dtype=torch.float32)
        return padded, lengths, labels


# ===========================================================================
# LSTMTrainer
# ===========================================================================

class LSTMTrainer:
    """
    Training orchestrator for :class:`LSTMChurnEncoder`.

    Features:
      - Train / validation split (80/20)
      - Binary cross-entropy loss
      - AUC-ROC metric tracked on validation set each epoch
      - Early stopping with configurable patience
      - Best-model checkpointing (saves when val_loss improves)

    Args:
        model: An initialised :class:`LSTMChurnEncoder`.
        lr:    Adam learning rate.  Defaults to ``1e-3``.
        device: PyTorch device string.  Defaults to ``"cuda"`` if available,
                else ``"cpu"``.
    """

    def __init__(
        self,
        model: LSTMChurnEncoder,
        lr: float = 1e-3,
        device: Optional[str] = None,
        label_smoothing: float = 0.1,
    ) -> None:
        self.device = torch.device(
            device or ("cuda" if torch.cuda.is_available() else "cpu")
        )
        self.model = model.to(self.device)
        self.optimizer = Adam(model.parameters(), lr=lr, weight_decay=1e-3)
        self.criterion = nn.BCELoss()
        self.label_smoothing = label_smoothing
        self._vocab: Optional[Dict[str, int]] = None

    # ------------------------------------------------------------------
    # Training loop
    # ------------------------------------------------------------------

    def train(
        self,
        dataset: SessionDataset,
        epochs: int = 20,
        batch_size: int = 32,
        val_split: float = 0.2,
        patience: int = 5,
        checkpoint_path: str = "best_lstm.pt",
        val_dataset: Optional[SessionDataset] = None,
    ) -> Dict[str, List[float]]:
        """
        Train the model with early stopping and best-model checkpointing.

        Args:
            dataset:         :class:`SessionDataset` to train on.
            epochs:          Maximum training epochs.
            batch_size:      Mini-batch size.
            val_split:       Fraction of data to reserve for validation (if val_dataset is None).
            patience:        Early-stopping patience (epochs without improvement).
            checkpoint_path: Path to save the best model weights.
            val_dataset:     Optional pre-split validation dataset.

        Returns:
            History dict with keys ``"train_loss"``, ``"val_loss"``, ``"val_auc"``.
            Each value is a list of per-epoch floats.
        """
        self._vocab = dataset.vocab

        if val_dataset is not None:
            train_ds = dataset
            val_ds = val_dataset
        else:
            # Train / val split
            n_val = max(1, int(len(dataset) * val_split))
            n_train = len(dataset) - n_val
            train_ds, val_ds = random_split(dataset, [n_train, n_val])

        train_loader = DataLoader(
            train_ds, batch_size=batch_size, shuffle=True,
            collate_fn=SessionDataset.collate_fn,
        )
        val_loader = DataLoader(
            val_ds, batch_size=batch_size, shuffle=False,
            collate_fn=SessionDataset.collate_fn,
        )

        history: Dict[str, List[float]] = {
            "train_loss": [], "val_loss": [], "val_auc": []
        }
        best_val_loss = float("inf")
        epochs_without_improvement = 0
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer, mode="min", factor=0.5, patience=2
        )

        for epoch in range(1, epochs + 1):
            # --- Train ---
            self.model.train()
            train_loss = 0.0
            for padded, lengths, labels in train_loader:
                padded = padded.to(self.device)
                lengths = lengths.to(self.device)
                labels = labels.to(self.device)

                # Apply label smoothing: shift labels away from 0/1
                if self.label_smoothing > 0:
                    labels = labels * (1.0 - self.label_smoothing) + 0.5 * self.label_smoothing

                self.optimizer.zero_grad()
                churn_prob, _ = self.model(padded, lengths)
                loss = self.criterion(churn_prob.squeeze(1), labels)
                loss.backward()
                nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                self.optimizer.step()
                train_loss += loss.item()

            train_loss /= max(len(train_loader), 1)

            # --- Validate ---
            val_loss, val_auc = self._evaluate(val_loader)
            scheduler.step(val_loss)

            history["train_loss"].append(round(train_loss, 6))
            history["val_loss"].append(round(val_loss, 6))
            history["val_auc"].append(round(val_auc, 6))

            # Per-epoch logging
            print(f"    [Epoch {epoch:02d}/{epochs}] "
                  f"train_loss={train_loss:.4f}  val_loss={val_loss:.4f}  val_auc={val_auc:.4f}")

            # Early stopping + checkpointing
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                epochs_without_improvement = 0
                torch.save(self.model.state_dict(), checkpoint_path)
            else:
                epochs_without_improvement += 1
                if epochs_without_improvement >= patience:
                    print(f"[EarlyStopping] Stopped at epoch {epoch} "
                          f"(patience={patience})")
                    break

        # Restore best weights
        if os.path.exists(checkpoint_path):
            self.model.load_state_dict(torch.load(checkpoint_path, map_location=self.device, weights_only=True))

        return history

    def _evaluate(self, loader: DataLoader) -> Tuple[float, float]:
        """Run one validation pass; returns (avg_loss, roc_auc)."""
        self.model.eval()
        all_preds, all_labels = [], []
        total_loss = 0.0

        with torch.no_grad():
            for padded, lengths, labels in loader:
                padded = padded.to(self.device)
                lengths = lengths.to(self.device)
                labels = labels.to(self.device)

                churn_prob, _ = self.model(padded, lengths)
                loss = self.criterion(churn_prob.squeeze(1), labels)
                total_loss += loss.item()

                all_preds.extend(churn_prob.squeeze(1).cpu().numpy().tolist())
                all_labels.extend(labels.cpu().numpy().tolist())

        avg_loss = total_loss / max(len(loader), 1)
        auc = _roc_auc(all_labels, all_preds)
        return avg_loss, auc

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def predict(self, sequences: List[List[str]]) -> List[Dict]:
        """
        Run inference on raw feature sequences.

        Args:
            sequences: List of feature-name lists (one per session).

        Returns:
            List of prediction dicts, one per sequence::

                {
                    "sequence":          ["kyc_check", "doc_upload", ...],
                    "churn_probability": 0.73,
                    "confidence":        0.82,      # 1 - entropy
                    "session_embedding": [0.12, ...]
                }

        Raises:
            RuntimeError: If the trainer has not been trained yet (no vocab).
        """
        if self._vocab is None:
            raise RuntimeError("Trainer must be trained before calling predict.")

        dummy_labels = [0] * len(sequences)
        dataset = SessionDataset(sequences, dummy_labels, vocab=self._vocab)
        loader = DataLoader(
            dataset, batch_size=64, shuffle=False,
            collate_fn=SessionDataset.collate_fn,
        )

        results = []
        self.model.eval()
        seq_idx = 0

        with torch.no_grad():
            for padded, lengths, _ in loader:
                padded = padded.to(self.device)
                lengths = lengths.to(self.device)

                churn_probs, embeddings = self.model(padded, lengths)

                for i in range(padded.size(0)):
                    p = float(churn_probs[i, 0].cpu())
                    # confidence: 1 − binary entropy
                    conf = 1.0 - _binary_entropy(p)
                    emb = embeddings[i].cpu().numpy().tolist()

                    results.append({
                        "sequence": sequences[seq_idx],
                        "churn_probability": round(p, 4),
                        "confidence": round(conf, 4),
                        "session_embedding": emb,
                    })
                    seq_idx += 1

        return results

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, path: str) -> None:
        """
        Save model weights and vocabulary to disk.

        Args:
            path: Base output path (e.g. ``"models/lstm_trainer"``).
                  Generates ``<path>.pt`` and ``<path>.vocab.pkl``.
        """
        torch.save(self.model.state_dict(), f"{path}.pt")
        with open(f"{path}.vocab.pkl", "wb") as f:
            pickle.dump(self._vocab, f)

    def load(self, path: str) -> None:
        """
        Load model weights and vocabulary from disk.

        Args:
            path: Base path used during :meth:`save`.
        """
        self.model.load_state_dict(
            torch.load(f"{path}.pt", map_location=self.device)
        )
        with open(f"{path}.vocab.pkl", "rb") as f:
            self._vocab = pickle.load(f)


# ===========================================================================
# Synthetic Data Augmentation
# ===========================================================================

def augment_sequences(
    sequences: List[List[str]],
    labels: List[int],
    target_size: int = 1000,
) -> Tuple[List[List[str]], List[int]]:
    """
    Augment a small dataset to ``target_size`` via three complementary strategies
    while preserving the original churn-label ratio.

    Strategies (applied in order until ``target_size`` reached):

    1. **Random subsequence sampling** — drop 1–3 random middle steps from an
       existing sequence.  Simulates incomplete journeys.

    2. **Markov-based generation** — fit a first-order transition table on the
       training sequences and sample new paths up to ``max_len`` steps.  Stops
       when it reaches an endpoint or exceeds length.

    3. **Feature substitution** — replace a random token in a sequence with a
       co-occurring similar feature (determined by co-occurrence frequency),
       creating plausible paraphrases.

    Label balance is maintained by computing the churn ratio and generating
    synthetic positives / negatives proportionally.

    Args:
        sequences:   Original training sequences.
        labels:      Aligned binary labels (0 = complete, 1 = churn).
        target_size: Total corpus size to reach (original + synthetic).

    Returns:
        Tuple ``(augmented_sequences, augmented_labels)`` of length >= ``target_size``.

    Raises:
        ValueError: If ``sequences`` is empty or ``target_size <= len(sequences)``.
    """
    if not sequences:
        raise ValueError("sequences must not be empty.")
    if target_size <= len(sequences):
        return sequences[:], labels[:]

    churn_ratio = sum(labels) / len(labels)
    needed = target_size - len(sequences)

    # Separate by label for balanced generation
    pos_seqs = [s for s, l in zip(sequences, labels) if l == 1]
    neg_seqs = [s for s, l in zip(sequences, labels) if l == 0]

    # Build Markov transition table
    transition: Dict[str, Counter] = {}
    for seq in sequences:
        for i in range(len(seq) - 1):
            transition.setdefault(seq[i], Counter())
            transition[seq[i]][seq[i + 1]] += 1

    # Build co-occurrence map (for substitution strategy)
    cooccurrence: Dict[str, Counter] = {}
    for seq in sequences:
        for i, tok in enumerate(seq):
            window = seq[max(0, i-2): i] + seq[i+1: i+3]
            cooccurrence.setdefault(tok, Counter())
            for w in window:
                cooccurrence[tok][w] += 1

    all_tokens = list({t for s in sequences for t in s})

    aug_seqs: List[List[str]] = []
    aug_labels: List[int] = []

    def _subsequence(source: List[str]) -> List[str]:
        """Drop 1-3 random middle steps."""
        if len(source) <= 2:
            return source[:]
        n_drop = min(random.randint(1, 3), len(source) - 2)
        drop_idxs = set(random.sample(range(1, len(source) - 1), n_drop))
        return [t for i, t in enumerate(source) if i not in drop_idxs]

    def _markov_sample(seed: str, max_len: int = 8) -> List[str]:
        """Generate a new sequence using the transition table."""
        seq = [seed]
        for _ in range(max_len - 1):
            nexts = transition.get(seq[-1])
            if not nexts:
                break
            choices, weights = zip(*nexts.items())
            seq.append(random.choices(choices, weights=weights, k=1)[0])
        return seq

    def _feature_substitute(source: List[str]) -> List[str]:
        """Replace one random token with a co-occurring neighbour."""
        seq = source[:]
        idx = random.randrange(len(seq))
        neighbours = cooccurrence.get(seq[idx])
        if neighbours:
            candidates, weights = zip(*neighbours.most_common(5))
            seq[idx] = random.choices(candidates, weights=weights, k=1)[0]
        else:
            seq[idx] = random.choice(all_tokens)
        return seq

    def _truncate_mid(source: List[str]) -> List[str]:
        """Truncate at a random midpoint to simulate in-progress sessions."""
        if len(source) <= 2:
            return source[:]
        cut = random.randint(2, len(source) - 1)
        return source[:cut]

    for _ in range(needed):
        # Decide label based on ratio
        if not neg_seqs or (pos_seqs and random.random() < churn_ratio):
            source_pool, lbl = pos_seqs, 1
        else:
            source_pool, lbl = neg_seqs, 0

        if not source_pool:
            source_pool = sequences
            lbl = random.randint(0, 1)

        source = random.choice(source_pool)
        strategy = random.choices(
            ["subsequence", "markov", "substitute", "truncate"],
            weights=[0.3, 0.25, 0.25, 0.2], k=1
        )[0]

        if strategy == "subsequence":
            new_seq = _subsequence(source)
        elif strategy == "markov":
            new_seq = _markov_sample(source[0])
        elif strategy == "truncate":
            new_seq = _truncate_mid(source)
        else:
            new_seq = _feature_substitute(source)

        aug_seqs.append(new_seq)
        aug_labels.append(lbl)

    return sequences + aug_seqs, labels + aug_labels


# ===========================================================================
# Utility helpers
# ===========================================================================

def _binary_entropy(p: float) -> float:
    """
    Compute binary entropy H(p) = -p·log(p) - (1-p)·log(1-p).

    Returns 0 for degenerate p=0 or p=1.
    """
    eps = 1e-9
    p = max(eps, min(1.0 - eps, p))
    return -p * math.log2(p) - (1 - p) * math.log2(1 - p)


def _roc_auc(labels: List[float], preds: List[float]) -> float:
    """
    Compute ROC-AUC using the trapezoidal rule (no sklearn dependency).

    Falls back to 0.5 if only one class is present in ``labels``.
    """
    if len(set(labels)) < 2:
        return 0.5

    paired = sorted(zip(preds, labels), key=lambda x: -x[0])
    n_pos = sum(labels)
    n_neg = len(labels) - n_pos
    if n_pos == 0 or n_neg == 0:
        return 0.5

    tp, fp = 0.0, 0.0
    auc = 0.0
    prev_fp = 0.0

    for _, lbl in paired:
        if lbl == 1:
            tp += 1
        else:
            fp += 1
            auc += tp  # area under the step

    auc /= n_pos * n_neg
    return float(np.clip(auc, 0.0, 1.0))
