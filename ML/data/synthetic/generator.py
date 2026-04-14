from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Iterable
from uuid import uuid4

import pandas as pd

FEATURES = [
    "login",
    "kyc_check",
    "doc_upload",
    "bureau_pull",
    "manual_review",
    "credit_scoring",
    "income_verification",
    "loan_offer_view",
    "loan_accept",
    "disbursement",
    "drop_off",
]

_FEATURE_META = {
    "login": ("navigation", "auth", "open"),
    "kyc_check": ("origination", "kyc_engine", "submit"),
    "doc_upload": ("origination", "document_center", "upload"),
    "bureau_pull": ("risk", "bureau", "fetch"),
    "manual_review": ("risk", "operations", "review"),
    "credit_scoring": ("risk", "scoring", "score"),
    "income_verification": ("origination", "income", "verify"),
    "loan_offer_view": ("conversion", "offers", "view"),
    "loan_accept": ("conversion", "offers", "accept"),
    "disbursement": ("conversion", "loan_engine", "complete"),
    "drop_off": ("conversion", "journey", "abandon"),
}

_POSITIVE_FEEDBACK = [
    "Journey felt smooth and clear.",
    "Offer details were easy to understand.",
    "Verification completed quickly.",
]

_NEGATIVE_FEEDBACK = [
    "Upload kept failing on mobile.",
    "Verification took too long and felt confusing.",
    "I dropped when bureau pull asked for more details.",
]

_SUCCESS_TEMPLATE = [
    "login",
    "kyc_check",
    "doc_upload",
    "bureau_pull",
    "credit_scoring",
    "loan_offer_view",
    "loan_accept",
    "disbursement",
]

_CHURN_TEMPLATE = [
    "login",
    "kyc_check",
    "doc_upload",
    "income_verification",
    "bureau_pull",
    "drop_off",
]


def _deployment_type(index: int) -> str:
    return "on_prem" if index % 5 == 0 else "cloud"


def _channel(index: int) -> str:
    return ("web", "android", "ios")[index % 3]


def _event_rows(
    tenant_id: str,
    session_id: str,
    user_id: str,
    sequence: Iterable[str],
    churn_label: int,
    deployment_type: str,
    channel: str,
    start_at: datetime,
    rng: random.Random,
) -> list[dict]:
    rows: list[dict] = []
    cursor = start_at
    feedback_text = rng.choice(_NEGATIVE_FEEDBACK if churn_label else _POSITIVE_FEEDBACK)

    for idx, feature in enumerate(sequence):
        l1_domain, l2_module, l4_action = _FEATURE_META[feature]
        cursor += timedelta(seconds=rng.randint(15, 120))
        success = feature != "drop_off"

        rows.append(
            {
                "tenant_id": tenant_id,
                "session_id": session_id,
                "user_id": user_id,
                "timestamp": cursor.isoformat(),
                "deployment_type": deployment_type,
                "channel": channel,
                "l1_domain": l1_domain,
                "l2_module": l2_module,
                "l3_feature": feature,
                "l4_action": l4_action,
                "l5_deployment_node": f"{deployment_type}-node-{(idx % 3) + 1}",
                "duration_ms": rng.randint(300, 12_000),
                "success": success,
                "metadata": {"step_index": idx, "source": "synthetic"},
                "feedback_text": feedback_text if idx == len(tuple(sequence)) - 1 else None,
                "churn_label": churn_label,
            }
        )

    return rows


def generate_dataset(
    n_tenants: int = 2,
    n_sessions_per_tenant: int = 100,
    churn_rate: float = 0.35,
    noise_factor: float = 0.1,
    seed: int | None = None,
) -> pd.DataFrame:
    """Generate a deterministic synthetic lending events dataset for tests."""
    rng = random.Random(seed)
    base_time = datetime(2024, 1, 1, 9, 0, tzinfo=timezone.utc)
    rows: list[dict] = []

    for tenant_index in range(n_tenants):
        tenant_id = f"tenant_{tenant_index + 1:02d}"
        for session_index in range(n_sessions_per_tenant):
            session_id = str(uuid4())
            user_id = f"user_{tenant_index + 1:02d}_{session_index % max(10, n_sessions_per_tenant // 4):03d}"
            should_churn = rng.random() < churn_rate
            sequence = list(_CHURN_TEMPLATE if should_churn else _SUCCESS_TEMPLATE)

            if rng.random() < noise_factor:
                insertion = rng.choice(["manual_review", "income_verification", "credit_scoring"])
                position = min(len(sequence) - 1, max(1, rng.randint(1, len(sequence) - 2)))
                if insertion not in sequence:
                    sequence.insert(position, insertion)

            if should_churn and sequence[-1] != "drop_off":
                sequence.append("drop_off")

            start_at = base_time + timedelta(minutes=(tenant_index * n_sessions_per_tenant + session_index) * 7)
            rows.extend(
                _event_rows(
                    tenant_id=tenant_id,
                    session_id=session_id,
                    user_id=user_id,
                    sequence=sequence,
                    churn_label=int(should_churn),
                    deployment_type=_deployment_type(session_index),
                    channel=_channel(session_index),
                    start_at=start_at,
                    rng=rng,
                )
            )

    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values(["tenant_id", "session_id", "timestamp"]).reset_index(drop=True)
    return df
