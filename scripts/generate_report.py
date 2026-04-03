"""
Training Metrics Report Generator for Finspark Intelligence.

Evaluates all trained tenant models and produces:
  - Per-tenant classification metrics (Accuracy, Precision, Recall, F1, AUC)
  - Confusion matrices
  - ROC curves
  - Training loss/AUC convergence curves
  - Markov friction feature analysis
  - N-gram perplexity distribution
  - Consolidated PDF-style report saved as images
"""

import os
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
import sys
import json
import warnings
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.patches import FancyBboxPatch
import torch
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, roc_curve, confusion_matrix, classification_report
)

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from models.implicit.markov import MarkovChain
from models.implicit.ngram import NgramModel
from models.implicit.lstm_encoder import LSTMChurnEncoder, LSTMTrainer, SessionDataset

# ---------------------------------------------------------------------------
# Style config
# ---------------------------------------------------------------------------
COLORS = {
    'bg':        '#0f0f1a',
    'card':      '#1a1a2e',
    'accent':    '#6c63ff',
    'accent2':   '#00d2ff',
    'success':   '#00e676',
    'warning':   '#ffab00',
    'danger':    '#ff5252',
    'text':      '#e0e0e0',
    'text_dim':  '#888899',
    'grid':      '#2a2a3e',
    'roc_fill':  '#6c63ff22',
}

plt.rcParams.update({
    'figure.facecolor': COLORS['bg'],
    'axes.facecolor':   COLORS['card'],
    'axes.edgecolor':   COLORS['grid'],
    'axes.labelcolor':  COLORS['text'],
    'text.color':       COLORS['text'],
    'xtick.color':      COLORS['text_dim'],
    'ytick.color':      COLORS['text_dim'],
    'grid.color':       COLORS['grid'],
    'grid.alpha':       0.3,
    'font.family':      'sans-serif',
    'font.size':        10,
})


def _load_tenant_data(df, tenant_id):
    """Extract sequences and labels for a tenant."""
    tenant_df = df[df["tenant_id"] == tenant_id]
    grouped = tenant_df.groupby("session_id")
    sequences, labels = [], []
    for _, group in grouped:
        group = group.sort_values("timestamp")
        seq = group["l3_feature"].tolist()
        label = int(group["churn_label"].iloc[0])
        sequences.append(seq)
        labels.append(label)
    return sequences, labels


def _evaluate_lstm(trainer, sequences, labels, vocab):
    """Run LSTM inference and return predictions + probabilities."""
    ds = SessionDataset(sequences, labels, vocab=vocab)
    from torch.utils.data import DataLoader
    loader = DataLoader(ds, batch_size=64, shuffle=False, collate_fn=SessionDataset.collate_fn)

    all_probs, all_labels = [], []
    trainer.model.eval()
    with torch.no_grad():
        for padded, lengths, lbls in loader:
            padded = padded.to(trainer.device)
            lengths = lengths.to(trainer.device)
            probs, _ = trainer.model(padded, lengths)
            all_probs.extend(probs.squeeze(1).cpu().numpy().tolist())
            all_labels.extend(lbls.numpy().tolist())

    return np.array(all_probs), np.array(all_labels)


def generate_report():
    data_path = os.path.join(PROJECT_ROOT, "data", "synthetic", "lending_events.csv")
    report_dir = os.path.join(PROJECT_ROOT, "reports")
    os.makedirs(report_dir, exist_ok=True)

    print("Loading dataset...")
    df = pd.read_csv(data_path)
    tenants = df["tenant_id"].unique()
    print(f"Found {len(tenants)} tenants.\n")

    all_results = []

    for t_idx, tenant in enumerate(tenants):
        tenant_short = tenant[:8]
        print(f"=== Evaluating Tenant: {tenant_short}... ===")

        tenant_dir = os.path.join(PROJECT_ROOT, "data", "models", tenant)
        manifest_path = os.path.join(tenant_dir, "manifest.json")

        if not os.path.exists(manifest_path):
            print(f"  Skipping — no manifest.json found.")
            continue

        with open(manifest_path) as f:
            manifest = json.load(f)

        sequences, labels = _load_tenant_data(df, tenant)

        # Split same way as training
        train_seqs, val_seqs, train_labels, val_labels = train_test_split(
            sequences, labels, test_size=0.2, random_state=42, stratify=labels
        )

        # Load vocab
        vocab_path = os.path.join(tenant_dir, "vocab.json")
        with open(vocab_path) as f:
            vocab = json.load(f)

        # Load LSTM
        lstm_model = LSTMChurnEncoder(vocab_size=len(vocab), embed_dim=16, hidden_dim=32, num_layers=1)
        trainer = LSTMTrainer(lstm_model, device="cpu")
        trainer.model.load_state_dict(
            torch.load(os.path.join(tenant_dir, "best_lstm.pt"), map_location="cpu", weights_only=True)
        )
        trainer._vocab = vocab

        # Evaluate on val set
        val_probs, val_labels_arr = _evaluate_lstm(trainer, val_seqs, val_labels, vocab)
        val_preds = (val_probs >= 0.5).astype(int)

        # Evaluate on full set (for distribution analysis)
        full_probs, full_labels_arr = _evaluate_lstm(trainer, sequences, labels, vocab)

        # Compute metrics
        acc = accuracy_score(val_labels_arr, val_preds)
        prec = precision_score(val_labels_arr, val_preds, zero_division=0)
        rec = recall_score(val_labels_arr, val_preds, zero_division=0)
        f1 = f1_score(val_labels_arr, val_preds, zero_division=0)
        auc = roc_auc_score(val_labels_arr, val_probs)
        cm = confusion_matrix(val_labels_arr, val_preds)
        fpr, tpr, _ = roc_curve(val_labels_arr, val_probs)

        # Load Markov for friction
        mc = MarkovChain.load(os.path.join(tenant_dir, "markov.pkl"))
        friction = mc.get_friction_features(threshold=0.15)

        # Load N-gram for perplexity
        ngm = NgramModel.load(os.path.join(tenant_dir, "ngram.pkl"))
        perplexities = [ngm.score_sequence(seq) for seq in val_seqs]

        result = {
            'tenant': tenant, 'tenant_short': tenant_short,
            'acc': acc, 'prec': prec, 'rec': rec, 'f1': f1, 'auc': auc,
            'cm': cm, 'fpr': fpr, 'tpr': tpr,
            'val_probs': val_probs, 'val_labels': val_labels_arr,
            'full_probs': full_probs, 'full_labels': full_labels_arr,
            'friction': friction, 'perplexities': perplexities,
            'manifest': manifest, 'n_sessions': len(sequences),
            'churn_rate': sum(labels) / len(labels),
        }
        all_results.append(result)

        print(f"  Acc={acc:.3f}  Prec={prec:.3f}  Rec={rec:.3f}  F1={f1:.3f}  AUC={auc:.4f}")

    # -----------------------------------------------------------------------
    # Generate consolidated report figure
    # -----------------------------------------------------------------------
    print(f"\nGenerating report visuals...")
    n_tenants = len(all_results)

    # ===== PAGE 1: Executive Summary + ROC Curves =====
    fig = plt.figure(figsize=(20, 14))
    fig.patch.set_facecolor(COLORS['bg'])

    gs = gridspec.GridSpec(3, n_tenants, figure=fig, hspace=0.4, wspace=0.35,
                           top=0.88, bottom=0.06, left=0.06, right=0.96)

    # Title
    fig.suptitle('FINSPARK INTELLIGENCE — Model Training Report',
                 fontsize=22, fontweight='bold', color=COLORS['accent'],
                 y=0.96)
    fig.text(0.5, 0.92,
             f'{n_tenants} Tenants  •  {sum(r["n_sessions"] for r in all_results):,} Sessions  •  '
             f'BiLSTM + Markov + N-gram Pipeline',
             ha='center', fontsize=11, color=COLORS['text_dim'])

    for i, r in enumerate(all_results):
        # --- Row 1: KPI Cards ---
        ax_kpi = fig.add_subplot(gs[0, i])
        ax_kpi.set_xlim(0, 1)
        ax_kpi.set_ylim(0, 1)
        ax_kpi.axis('off')

        # Card background
        card = FancyBboxPatch((0.02, 0.02), 0.96, 0.96, boxstyle="round,pad=0.05",
                              facecolor=COLORS['card'], edgecolor=COLORS['grid'], linewidth=1.5)
        ax_kpi.add_patch(card)

        ax_kpi.text(0.5, 0.92, f"Tenant {r['tenant_short']}",
                    ha='center', va='top', fontsize=13, fontweight='bold', color=COLORS['accent2'])

        metrics = [
            ('AUC-ROC', r['auc'], COLORS['accent']),
            ('F1 Score', r['f1'], COLORS['success']),
            ('Precision', r['prec'], COLORS['warning']),
            ('Recall', r['rec'], COLORS['accent2']),
            ('Accuracy', r['acc'], COLORS['text']),
        ]
        for j, (name, val, color) in enumerate(metrics):
            y = 0.75 - j * 0.15
            ax_kpi.text(0.12, y, name, ha='left', va='center', fontsize=9, color=COLORS['text_dim'])
            ax_kpi.text(0.88, y, f"{val:.4f}", ha='right', va='center', fontsize=12,
                       fontweight='bold', color=color)

        ax_kpi.text(0.5, 0.05, f"Sessions: {r['n_sessions']}  |  Churn: {r['churn_rate']:.1%}",
                    ha='center', va='bottom', fontsize=8, color=COLORS['text_dim'])

        # --- Row 2: ROC Curve ---
        ax_roc = fig.add_subplot(gs[1, i])
        ax_roc.fill_between(r['fpr'], r['tpr'], alpha=0.15, color=COLORS['accent'])
        ax_roc.plot(r['fpr'], r['tpr'], color=COLORS['accent'], linewidth=2.5,
                    label=f"AUC = {r['auc']:.4f}")
        ax_roc.plot([0, 1], [0, 1], '--', color=COLORS['text_dim'], linewidth=1, alpha=0.5)
        ax_roc.set_xlabel('False Positive Rate', fontsize=9)
        ax_roc.set_ylabel('True Positive Rate', fontsize=9)
        ax_roc.set_title(f'ROC Curve — {r["tenant_short"]}', fontsize=10, color=COLORS['text'], pad=8)
        ax_roc.legend(loc='lower right', fontsize=9, framealpha=0.3)
        ax_roc.set_xlim(-0.02, 1.02)
        ax_roc.set_ylim(-0.02, 1.02)
        ax_roc.grid(True, alpha=0.2)

        # --- Row 3: Confusion Matrix ---
        ax_cm = fig.add_subplot(gs[2, i])
        cm = r['cm']
        cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True)

        im = ax_cm.imshow(cm_norm, cmap='Blues', vmin=0, vmax=1, aspect='auto')
        ax_cm.set_xticks([0, 1])
        ax_cm.set_yticks([0, 1])
        ax_cm.set_xticklabels(['Complete', 'Churn'], fontsize=9)
        ax_cm.set_yticklabels(['Complete', 'Churn'], fontsize=9)
        ax_cm.set_xlabel('Predicted', fontsize=9)
        ax_cm.set_ylabel('Actual', fontsize=9)
        ax_cm.set_title(f'Confusion Matrix — {r["tenant_short"]}', fontsize=10, color=COLORS['text'], pad=8)

        for row in range(2):
            for col in range(2):
                val = cm[row, col]
                pct = cm_norm[row, col]
                ax_cm.text(col, row, f"{val}\n({pct:.0%})",
                          ha='center', va='center', fontsize=11, fontweight='bold',
                          color='white' if pct > 0.5 else COLORS['text'])

    path1 = os.path.join(report_dir, "report_page1_summary.png")
    fig.savefig(path1, dpi=150, facecolor=COLORS['bg'])
    plt.close(fig)
    print(f"  Saved: {path1}")

    # ===== PAGE 2: Distributions + Friction Analysis =====
    fig2 = plt.figure(figsize=(20, 12))
    fig2.patch.set_facecolor(COLORS['bg'])

    gs2 = gridspec.GridSpec(2, n_tenants, figure=fig2, hspace=0.35, wspace=0.35,
                            top=0.90, bottom=0.08, left=0.06, right=0.96)

    fig2.suptitle('FINSPARK INTELLIGENCE — Distribution & Friction Analysis',
                  fontsize=22, fontweight='bold', color=COLORS['accent'], y=0.97)

    for i, r in enumerate(all_results):
        # --- Row 1: Prediction probability distribution ---
        ax_dist = fig2.add_subplot(gs2[0, i])

        complete_probs = r['full_probs'][r['full_labels'] == 0]
        churn_probs = r['full_probs'][r['full_labels'] == 1]

        bins = np.linspace(0, 1, 30)
        ax_dist.hist(complete_probs, bins=bins, alpha=0.6, color=COLORS['success'],
                     label=f'Complete (n={len(complete_probs)})', edgecolor='none')
        ax_dist.hist(churn_probs, bins=bins, alpha=0.6, color=COLORS['danger'],
                     label=f'Churn (n={len(churn_probs)})', edgecolor='none')
        ax_dist.set_xlabel('Predicted Churn Probability', fontsize=9)
        ax_dist.set_ylabel('Count', fontsize=9)
        ax_dist.set_title(f'Score Distribution — {r["tenant_short"]}', fontsize=10,
                          color=COLORS['text'], pad=8)
        ax_dist.legend(fontsize=8, framealpha=0.3)
        ax_dist.grid(True, alpha=0.2)

        # --- Row 2: Friction features (Markov) ---
        ax_fric = fig2.add_subplot(gs2[1, i])

        if r['friction']:
            features = [f['feature'] for f in r['friction']][:8]
            probs = [f['drop_off_prob'] for f in r['friction']][:8]

            colors = []
            for p in probs:
                if p >= 0.60:
                    colors.append(COLORS['danger'])
                elif p >= 0.40:
                    colors.append(COLORS['warning'])
                else:
                    colors.append(COLORS['accent2'])

            bars = ax_fric.barh(range(len(features)), probs, color=colors, height=0.6, alpha=0.85)
            ax_fric.set_yticks(range(len(features)))
            ax_fric.set_yticklabels(features, fontsize=9)
            ax_fric.set_xlabel('P(drop_off | feature)', fontsize=9)
            ax_fric.set_xlim(0, 1)
            ax_fric.invert_yaxis()

            for bar, p in zip(bars, probs):
                ax_fric.text(bar.get_width() + 0.02, bar.get_y() + bar.get_height()/2,
                            f'{p:.1%}', va='center', fontsize=9, color=COLORS['text'])
        else:
            ax_fric.text(0.5, 0.5, 'No friction features\nabove threshold',
                        ha='center', va='center', color=COLORS['text_dim'], fontsize=11)
            ax_fric.axis('off')

        ax_fric.set_title(f'Friction Features — {r["tenant_short"]}', fontsize=10,
                          color=COLORS['text'], pad=8)
        ax_fric.grid(True, axis='x', alpha=0.2)

    path2 = os.path.join(report_dir, "report_page2_analysis.png")
    fig2.savefig(path2, dpi=150, facecolor=COLORS['bg'])
    plt.close(fig2)
    print(f"  Saved: {path2}")

    # ===== Console summary table =====
    print("\n" + "=" * 72)
    print("  TRAINING REPORT SUMMARY")
    print("=" * 72)
    print(f"  {'Tenant':<12} {'Acc':>7} {'Prec':>7} {'Rec':>7} {'F1':>7} {'AUC':>8} {'Sessions':>9}")
    print("-" * 72)
    for r in all_results:
        print(f"  {r['tenant_short']:<12} {r['acc']:>7.4f} {r['prec']:>7.4f} "
              f"{r['rec']:>7.4f} {r['f1']:>7.4f} {r['auc']:>8.4f} {r['n_sessions']:>9}")
    print("-" * 72)

    avg_auc = np.mean([r['auc'] for r in all_results])
    avg_f1 = np.mean([r['f1'] for r in all_results])
    print(f"  {'AVERAGE':<12} {'':>7} {'':>7} {'':>7} {avg_f1:>7.4f} {avg_auc:>8.4f}")
    print("=" * 72)

    if avg_auc > 0.99:
        print("  ⚠️  WARNING: Average AUC > 0.99 — likely data leakage!")
    elif avg_auc > 0.95:
        print("  ℹ️  Note: AUC is high — monitor for overfitting on production data.")
    elif avg_auc > 0.70:
        print("  ✅  Healthy AUC range — model is learning real patterns.")
    else:
        print("  ⚠️  Low AUC — model may need more data or different architecture.")

    print(f"\n  Reports saved to: {report_dir}")
    print(f"    → {os.path.basename(path1)}")
    print(f"    → {os.path.basename(path2)}")

    return all_results


if __name__ == "__main__":
    try:
        generate_report()
    except BaseException as e:
        print("CRASHED", repr(e))
        import traceback
        traceback.print_exc()
        sys.exit(1)
