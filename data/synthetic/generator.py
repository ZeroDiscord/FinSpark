"""
Synthetic Dataset Generator for Finspark Intelligence.

Generates realistic enterprise lending platform event data with:
  - Configurable churn/completion patterns plus noise injection
  - Multi-tenant isolation (separate deployment types)
  - On-prem bureau_pull latency drop-off penalty
  - Synthetic feedback text for 30% of sessions
  - Ambiguous journey patterns that prevent trivial label leakage
  - Label noise injection for realism
"""

from __future__ import annotations

import hashlib
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

import pandas as pd

# ---------------------------------------------------------------------------
# Feature Taxonomy
# ---------------------------------------------------------------------------

FEATURES = [
    "login",
    "kyc_check",
    "doc_upload",
    "income_verification",
    "bureau_pull",
    "credit_scoring",
    "manual_review",
    "loan_offer_view",
    "loan_accept",
    "disbursement",
    "drop_off",
]

# ---------------------------------------------------------------------------
# Journey Patterns
# ---------------------------------------------------------------------------

# --- Clear churn patterns (user drops off) ---
CHURN_PATTERNS = [
    ["kyc_check", "doc_upload", "kyc_check", "drop_off"],              # doc rejection loop
    ["bureau_pull", "drop_off"],                                         # bureau friction
    ["loan_offer_view", "loan_offer_view", "loan_offer_view", "drop_off"],  # offer hesitation
    ["login", "kyc_check", "drop_off"],                                 # early abandon
    ["income_verification", "doc_upload", "kyc_check", "drop_off"],    # verification loop
    ["login", "drop_off"],                                               # immediate bounce
    ["kyc_check", "doc_upload", "bureau_pull", "credit_scoring", "drop_off"],  # mid-funnel exit
]

# --- Clear completion patterns (user gets loan disbursed) ---
COMPLETION_PATTERNS = [
    ["login", "kyc_check", "doc_upload", "bureau_pull",
     "credit_scoring", "loan_offer_view", "loan_accept", "disbursement"],
    ["login", "income_verification", "bureau_pull",
     "loan_offer_view", "loan_accept", "disbursement"],
    ["kyc_check", "doc_upload", "income_verification",
     "bureau_pull", "credit_scoring", "manual_review", "loan_accept", "disbursement"],
    ["login", "kyc_check", "bureau_pull",
     "credit_scoring", "loan_offer_view", "disbursement"],
    ["login", "kyc_check", "doc_upload", "income_verification",
     "bureau_pull", "loan_offer_view", "loan_accept", "disbursement"],
]

# --- Ambiguous patterns: CHURN despite reaching late stages ---
# These users get far in the journey but still drop off.
# The model can NOT rely on seeing "loan_offer_view" or "credit_scoring" as completion signals.
LATE_STAGE_CHURN_PATTERNS = [
    ["login", "kyc_check", "doc_upload", "bureau_pull",
     "credit_scoring", "loan_offer_view", "drop_off"],  # viewed offer but didn't accept
    ["login", "kyc_check", "bureau_pull", "credit_scoring",
     "loan_offer_view", "loan_accept", "drop_off"],     # accepted but didn't complete
    ["kyc_check", "doc_upload", "income_verification",
     "bureau_pull", "credit_scoring", "manual_review", "drop_off"],  # stuck in review
    ["login", "kyc_check", "doc_upload", "bureau_pull",
     "loan_offer_view", "loan_offer_view", "drop_off"],  # re-viewed offer, still left
]

# --- Ambiguous patterns: COMPLETION despite early friction ---
# These users struggle early but eventually complete.
FRICTION_COMPLETION_PATTERNS = [
    ["login", "kyc_check", "kyc_check", "doc_upload",
     "bureau_pull", "credit_scoring", "loan_accept", "disbursement"],  # KYC retry → success
    ["login", "kyc_check", "doc_upload", "doc_upload",
     "income_verification", "bureau_pull", "loan_offer_view",
     "loan_accept", "disbursement"],  # doc re-upload → success
    ["login", "bureau_pull", "bureau_pull", "credit_scoring",
     "loan_offer_view", "loan_accept", "disbursement"],  # bureau retry → success
    ["login", "kyc_check", "doc_upload", "income_verification",
     "income_verification", "bureau_pull", "credit_scoring",
     "manual_review", "loan_accept", "disbursement"],  # long friction → success
]

# ---------------------------------------------------------------------------
# Feedback Templates
# ---------------------------------------------------------------------------

_NEGATIVE_FEEDBACK = [
    "The bureau_pull step is extremely slow and times out.",
    "KYC check keeps failing even with valid documents.",
    "Doc upload is broken — I get an error every time I try.",
    "The loan offer page never loads properly, very frustrating.",
    "I can't complete income verification, the system is unusable.",
    "Manual review takes forever. I nearly cancelled my application.",
    "The app crashes at the credit scoring stage. Please fix this.",
    "Why does it ask me to upload documents 3 times? Terrible UX.",
]

_POSITIVE_FEEDBACK = [
    "The disbursement was instant and the process was very smooth!",
    "Really impressed with how fast the loan offer was generated.",
    "Income verification worked seamlessly. Great experience overall.",
    "Very clean interface. Completed the whole journey in under 5 minutes.",
    "The KYC check was painless. Approved within minutes!",
    "Excellent service. The loan offer was competitive and clear.",
]

_L5_NODES = {
    "cloud":    ["aws-us-east-1", "aws-eu-west-1", "gcp-us-central1"],
    "on_prem":  ["dc-mumbai-01", "dc-bangalore-02", "dc-chennai-03"],
}

_CHANNELS = ["web", "mobile", "api"]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _salted_hash(value: str, salt: str = "synth_salt") -> str:
    return hashlib.sha256(f"{salt}::{value}".encode()).hexdigest()


def _inject_noise(sequence: List[str], noise_factor: float) -> List[str]:
    """Randomly insert extra feature visits to simulate real-world detours."""
    noisy = list(sequence)
    transient = [f for f in FEATURES if f not in ("disbursement", "drop_off")]
    for i in range(len(sequence) - 1, 0, -1):  # iterate backwards to avoid index shift
        if random.random() < noise_factor:
            noisy.insert(i, random.choice(transient))
    return noisy


def _on_prem_penalty(sequence: List[str], extra_drop_rate: float = 0.20) -> List[str]:
    """
    Simulate on-prem bureau_pull latency: with ``extra_drop_rate`` probability,
    truncate the journey at bureau_pull and append drop_off.
    """
    if "bureau_pull" in sequence and random.random() < extra_drop_rate:
        idx = sequence.index("bureau_pull")
        return sequence[: idx + 1] + ["drop_off"]
    return sequence


def _random_truncate(sequence: List[str], label: int) -> Tuple[List[str], int]:
    """
    Randomly truncate a sequence at a mid-point to simulate sessions still in
    progress. This creates sequences where the terminal token does NOT match
    the original label, breaking the terminal-token-as-label proxy.
    
    Applied to ~15% of sessions.
    """
    if random.random() > 0.15 or len(sequence) <= 2:
        return sequence, label
    
    # Truncate at a random point (keep at least 2 tokens)
    cut_point = random.randint(2, len(sequence) - 1)
    truncated = sequence[:cut_point]
    
    # The label stays the same — the user was GOING to churn/complete,
    # but we only see the partial journey. This forces the model to learn
    # from the journey pattern, not just the last token.
    return truncated, label


def _make_timestamps(
    n_events: int, session_start: datetime
) -> List[datetime]:
    """Space events 30–300 seconds apart within a session."""
    ts = session_start
    timestamps = []
    for _ in range(n_events):
        timestamps.append(ts)
        ts += timedelta(seconds=random.randint(30, 300))
    return timestamps


def _feedback_for_session(sequence: List[str], label: int) -> Optional[str]:
    """Return synthetic feedback text (30% sessions get feedback)."""
    if random.random() > 0.30:
        return None
    pool = _NEGATIVE_FEEDBACK if label == 1 else _POSITIVE_FEEDBACK
    return random.choice(pool)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_dataset(
    n_tenants: int = 3,
    n_sessions_per_tenant: int = 500,
    churn_rate: float = 0.30,
    noise_factor: float = 0.25,
    deployment_split: float = 0.40,
    label_noise_rate: float = 0.05,
    seed: int = 42,
) -> pd.DataFrame:
    """
    Generate a realistic synthetic event dataset for an enterprise lending platform.

    Schema columns (aligned with FeatureEvent):
      tenant_id, session_id, user_id, timestamp, deployment_type, channel,
      l1_domain, l2_module, l3_feature, l4_action, l5_deployment_node,
      duration_ms, success, metadata, feedback_text, churn_label

    Realism features:
      - Churn sessions drawn from CHURN_PATTERNS + LATE_STAGE_CHURN_PATTERNS
      - Completion sessions drawn from COMPLETION_PATTERNS + FRICTION_COMPLETION_PATTERNS
      - ``noise_factor`` controls random step insertion probability
      - On-prem sessions suffer an extra 20% drop-off penalty at bureau_pull
      - ~15% of sessions randomly truncated (partial journeys)
      - ``label_noise_rate`` flips labels for added realism
      - 30% of sessions include synthetic feedback text
      - Each session generates one row **per feature event**

    Args:
        n_tenants:              Number of distinct tenants to simulate.
        n_sessions_per_tenant:  Sessions generated per tenant.
        churn_rate:             Fraction of sessions labelled as churn (0–1).
        noise_factor:           Probability of injecting random intermediate steps.
        deployment_split:       Fraction of sessions deployed on-prem.
        label_noise_rate:       Fraction of labels to randomly flip (realism noise).
        seed:                   Random seed for reproducibility.

    Returns:
        ``pd.DataFrame`` with one row per event.  ``churn_label`` is repeated
        for all events in the same session (session-level label).
    """
    random.seed(seed)
    rows: List[dict] = []

    # Combined pattern pools
    all_churn_patterns = CHURN_PATTERNS + LATE_STAGE_CHURN_PATTERNS
    all_completion_patterns = COMPLETION_PATTERNS + FRICTION_COMPLETION_PATTERNS

    for t_idx in range(n_tenants):
        tenant_raw = f"tenant_{t_idx:03d}"
        tenant_id = _salted_hash(tenant_raw)

        # Base session start time, spread over the last 90 days
        base_time = datetime.now(tz=timezone.utc) - timedelta(days=90)

        for s_idx in range(n_sessions_per_tenant):
            # Determine deployment type for this session
            deployment_type = "on_prem" if random.random() < deployment_split else "cloud"

            # Determine churn label
            label = 1 if random.random() < churn_rate else 0

            # Pick base pattern from expanded pools
            if label == 1:
                base_pattern = random.choice(all_churn_patterns)
            else:
                base_pattern = random.choice(all_completion_patterns)

            sequence = _inject_noise(list(base_pattern), noise_factor)

            # Apply on-prem latency penalty (completion journeys only, to keep label integrity)
            if deployment_type == "on_prem" and label == 0:
                penalised = _on_prem_penalty(sequence, extra_drop_rate=0.20)
                if penalised[-1] == "drop_off":
                    label = 1  # update label if penalty triggered churn
                sequence = penalised

            # Apply random truncation (creates partial journeys)
            sequence, label = _random_truncate(sequence, label)

            # Apply label noise — randomly flip some labels for realism
            if random.random() < label_noise_rate:
                label = 1 - label

            # Session metadata
            user_raw = f"user_{t_idx}_{s_idx}"
            user_id = _salted_hash(user_raw)
            session_raw = f"sess_{t_idx}_{s_idx}"
            session_id = _salted_hash(session_raw)
            channel = random.choice(_CHANNELS)
            node = random.choice(_L5_NODES[deployment_type])
            feedback = _feedback_for_session(sequence, label)

            # Session start: stagger across 90 days
            session_start = base_time + timedelta(
                days=random.uniform(0, 85),
                hours=random.uniform(0, 23),
            )
            timestamps = _make_timestamps(len(sequence), session_start)

            for ev_idx, (feature, ts) in enumerate(zip(sequence, timestamps)):
                is_last = ev_idx == len(sequence) - 1
                success = (feature != "drop_off") and not (is_last and label == 1)
                rows.append({
                    "tenant_id":          tenant_id,
                    "session_id":         session_id,
                    "user_id":            user_id,
                    "timestamp":          ts.isoformat(),
                    "deployment_type":    deployment_type,
                    "channel":            channel,
                    "l1_domain":          "origination",
                    "l2_module":          "kyc_engine" if "kyc" in feature or "doc" in feature
                                          else "credit_engine" if "bureau" in feature or "credit" in feature
                                          else "loan_engine",
                    "l3_feature":         feature,
                    "l4_action":          "complete" if success else "fail",
                    "l5_deployment_node": node,
                    "duration_ms":        random.randint(200, 8000)
                                          if deployment_type == "on_prem" and feature == "bureau_pull"
                                          else random.randint(80, 2000),
                    "success":            success,
                    "metadata": {
                        "session_index": s_idx,
                        "tenant_index":  t_idx,
                    },
                    # Extra columns for downstream use
                    "feedback_text":  feedback if ev_idx == 0 else None,  # attach once per session
                    "churn_label":    label,
                })

    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    return df


# ---------------------------------------------------------------------------
# CLI convenience
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import os

    out_dir = os.path.join(os.path.dirname(__file__))
    os.makedirs(out_dir, exist_ok=True)

    print("Generating synthetic dataset…")
    df = generate_dataset(
        n_tenants=3,
        n_sessions_per_tenant=500,
        churn_rate=0.30,
        noise_factor=0.25,
        label_noise_rate=0.05,
        seed=42,
    )
    out_path = os.path.join(out_dir, "lending_events.csv")
    df.to_csv(out_path, index=False)
    print(f"Saved {len(df):,} events → {out_path}")
    print(f"Sessions : {df['session_id'].nunique():,}")
    print(f"Tenants  : {df['tenant_id'].nunique()}")
    churn_sessions = df.groupby("session_id")["churn_label"].first()
    print(f"Churn %  : {churn_sessions.mean():.1%}")

    # Print terminal token distribution to verify no trivial leak
    last_tokens = df.groupby("session_id").agg(
        last_feature=("l3_feature", "last"),
        label=("churn_label", "first"),
    )
    print("\n--- Terminal Token vs Label Distribution ---")
    print(pd.crosstab(last_tokens["last_feature"], last_tokens["label"],
                      margins=True, margins_name="Total"))
