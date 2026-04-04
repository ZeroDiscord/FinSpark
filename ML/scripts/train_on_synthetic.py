import os
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
import sys
import json
from datetime import datetime
import pandas as pd
import torch
from sklearn.model_selection import train_test_split

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from models.implicit.markov import MarkovChain
from models.implicit.ngram import NgramModel
from models.implicit.lstm_encoder import LSTMChurnEncoder, LSTMTrainer, SessionDataset, augment_sequences
from models.explicit.rag_pipeline import FeatureRAGPipeline
from preprocessing.cooccurrence import compute_churn_conditional

def train_for_all_tenants():
    data_path = os.path.join(PROJECT_ROOT, "data", "synthetic", "lending_events.csv")
    if not os.path.exists(data_path):
        print(f"Dataset not found at {data_path}. Run generator first.")
        return

    print("Loading dataset...")
    df = pd.read_csv(data_path)
    
    # Group by tenant
    tenants = df["tenant_id"].unique()
    print(f"Found {len(tenants)} tenants. Starting training loop...\n")

    for tenant in tenants:
        print(f"=== Training models for Tenant: {tenant[:8]}... ===")
        tenant_df = df[df["tenant_id"] == tenant]
        
        # Group into sessions (sequences of l3_feature)
        grouped = tenant_df.groupby("session_id")
        
        sequences = []
        labels = []
        
        for _, group in grouped:
            group = group.sort_values("timestamp")
            seq = group["l3_feature"].tolist()
            
            # 1. Add a churn_label inference fallback
            if "churn_label" not in tenant_df.columns:
                print(f"  WARNING: no churn_label column. Inferring from drop_off presence.")
                label = 1 if "drop_off" in seq else 0
            else:
                label = int(group["churn_label"].iloc[0])
                
            sequences.append(seq)
            labels.append(label)
            
        print(f"  Extracted {len(sequences)} sessions (Churn rate: {sum(labels)/max(1, len(labels)):.1%})")

        # 5. Add augmentation step if len(sequences) < 500
        AUGMENT_THRESHOLD = 500
        if len(sequences) < AUGMENT_THRESHOLD:
            print(f"  Only {len(sequences)} sessions — augmenting to {AUGMENT_THRESHOLD}...")
            sequences, labels = augment_sequences(sequences, labels, target_size=AUGMENT_THRESHOLD)
            print(f"  -> Augmented to {len(sequences)} sessions.")

        # Create tenant output directory
        tenant_dir = os.path.join(PROJECT_ROOT, "data", "models", tenant)
        os.makedirs(tenant_dir, exist_ok=True)

        # 1. Train Markov
        print("  Training Markov Chain...")
        mc = MarkovChain()
        mc.fit(sequences, absorption_states=["disbursement", "drop_off"])
        mc.save(os.path.join(tenant_dir, "markov.pkl"))
        print(f"    -> Discovered {len(mc.states)} states.")

        # 2. Train N-gram
        print("  Training N-gram Model...")
        ngm = NgramModel(n=3)
        ngm.fit(sequences)
        ngm.save(os.path.join(tenant_dir, "ngram.pkl"))
        print(f"    -> Vocab size: {len(ngm.vocab)}.")

        # 3. Train LSTM
        print("  Training LSTM Encoder...")
        train_seqs, val_seqs, train_labels, val_labels = train_test_split(
            sequences, labels, test_size=0.2, random_state=42, stratify=labels
        )
        train_ds = SessionDataset(train_seqs, train_labels)
        val_ds = SessionDataset(val_seqs, val_labels, vocab=train_ds.vocab)
        
        lstm_model = LSTMChurnEncoder(vocab_size=len(train_ds.vocab), embed_dim=16, hidden_dim=32, num_layers=1)
        trainer = LSTMTrainer(lstm_model, device="cpu")
        ckpt = os.path.join(tenant_dir, "best_lstm.pt")
        history = trainer.train(train_ds, val_dataset=val_ds, epochs=30, batch_size=32, patience=7, checkpoint_path=ckpt)
        val_auc = history["val_auc"][-1] if history["val_auc"] else 0.0
        trainer.save(os.path.join(tenant_dir, "lstm"))
        
        # 2. Save ds.vocab as vocab.json in the tenant model directory
        vocab_path = os.path.join(tenant_dir, "vocab.json")
        with open(vocab_path, "w") as f:
            json.dump(train_ds.vocab, f)
        print(f"    -> Vocab saved to {vocab_path}")
        print(f"    -> LSTM trained. Final Val AUC: {val_auc:.4f}")
        
        # Sanity check: warn if AUC is suspiciously perfect
        if val_auc > 0.99:
            print(f"    ⚠️  WARNING: Val AUC={val_auc:.4f} is suspiciously high — possible data leakage!")
        elif val_auc < 0.55:
            print(f"    ⚠️  WARNING: Val AUC={val_auc:.4f} is very low — model may not be learning.")

        # 4. RAG Pipeline
        print("  Indexing RAG documents...")
        churn_map = compute_churn_conditional(sequences, labels)
        
        rag = FeatureRAGPipeline(collection_name=f"tenant_{tenant}")
        feature_docs = [
            {
                "id": feat,
                "description": f"Feature {feat} in the lending journey",
                "churn_rate": round(churn_map.get(feat, 0.0), 3),
                "usage_count": sum(feat in seq for seq in sequences)
            }
            for feat in ngm.vocab if not feat.startswith("<")
        ]
        rag.index_features(feature_docs)
        print(f"    -> Indexed {rag.count()} feature documents.")

        # 6. Write manifest.json
        manifest = {
            "tenant_id": tenant,
            "trained_at": datetime.utcnow().isoformat(),
            "n_sessions": len(sequences),
            "markov_states": len(mc.states),
            "ngram_vocab_size": len(ngm.vocab),
            "lstm_val_auc": round(val_auc, 4),
            "rag_documents": rag.count()
        }
        with open(os.path.join(tenant_dir, "manifest.json"), "w") as f:
            json.dump(manifest, f, indent=2)
            
        print("  -> manifest.json written.\n")

    print(f"Successfully trained and persisted models for {len(tenants)} tenants.")
    print("Restart the FastAPI server so the @app.on_event('startup') hook loads them into memory!")

if __name__ == "__main__":
    try:
        train_for_all_tenants()
    except BaseException as e:
        print("CRASHED", repr(e))
        import traceback
        traceback.print_exc()
        sys.exit(1)
