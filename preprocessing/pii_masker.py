"""
PII Masking Utilities for Finspark Intelligence.

Provides SHA-256 salted hashing for identity fields and regex-based
redaction for PII patterns inside event metadata.
"""

import hashlib
import os
import re
from typing import Any, Dict

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SALT: str = os.getenv("PII_SALT", "default_salt")

# ---------------------------------------------------------------------------
# PII Regex Patterns
# ---------------------------------------------------------------------------

_PAN_PATTERN = re.compile(r"[A-Z]{5}[0-9]{4}[A-Z]")
_PHONE_PATTERN = re.compile(r"\b[6-9]\d{9}\b")
_EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
_CREDIT_CARD_PATTERN = re.compile(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b")

_PATTERNS = [
    (_PAN_PATTERN, "[PAN_REDACTED]"),
    (_PHONE_PATTERN, "[PHONE_REDACTED]"),
    (_EMAIL_PATTERN, "[EMAIL_REDACTED]"),
    (_CREDIT_CARD_PATTERN, "[CC_REDACTED]"),
]


# ---------------------------------------------------------------------------
# Core Functions
# ---------------------------------------------------------------------------

def hash_id(value: str) -> str:
    """
    Produce a salted SHA-256 hex digest of the given value.

    Args:
        value: The plaintext identifier (user_id, session_id, tenant_id, etc.).

    Returns:
        A 64-character lowercase hex string representing the salted hash.

    Example:
        >>> hash_id("user_abc123")
        'a3f9...'  # deterministic for same (value, SALT)
    """
    salted = f"{SALT}::{value}"
    return hashlib.sha256(salted.encode("utf-8")).hexdigest()


def _redact_string(text: str) -> str:
    """
    Apply all PII regex patterns to a string, replacing matches with
    the corresponding redaction placeholder.

    Args:
        text: Raw string that may contain PII.

    Returns:
        Cleaned string with all detected PII replaced.
    """
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def _redact_value(value: Any) -> Any:
    """
    Recursively redact PII from any value type.

    - str  → apply regex redaction
    - dict → redact values recursively
    - list → redact each element recursively
    - other → return unchanged

    Args:
        value: Any Python value that may contain PII strings.

    Returns:
        The value with PII replaced.
    """
    if isinstance(value, str):
        return _redact_string(value)
    elif isinstance(value, dict):
        return {k: _redact_value(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [_redact_value(item) for item in value]
    return value


def mask_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply full PII masking to a raw event dictionary.

    Steps performed:
      1. Hash identity fields: ``user_id``, ``session_id``, ``tenant_id``
         using salted SHA-256 (via :func:`hash_id`).
      2. Recursively scan the ``metadata`` sub-dictionary and redact any
         detected PII patterns (PAN, phone, email, credit card).

    Args:
        event: A raw event dictionary (pre-Pydantic validation). The dict
               is **not** mutated; a new dict is returned.

    Returns:
        A new event dict with identity fields hashed and metadata cleaned.

    Example::

        raw = {
            "user_id": "john_doe",
            "session_id": "sess-001",
            "tenant_id": "bank-xyz",
            "metadata": {"contact": "john@example.com", "notes": "call 9876543210"}
        }
        clean = mask_event(raw)
        # clean["user_id"]  -> SHA-256 hex
        # clean["metadata"] -> {"contact": "[EMAIL_REDACTED]", "notes": "call [PHONE_REDACTED]"}
    """
    masked = dict(event)  # shallow copy — identity fields are scalars

    # 1. Hash identity fields
    for field in ("user_id", "session_id", "tenant_id"):
        if field in masked and masked[field] is not None:
            masked[field] = hash_id(str(masked[field]))

    # 2. Redact PII from metadata
    if "metadata" in masked and isinstance(masked["metadata"], dict):
        masked["metadata"] = _redact_value(masked["metadata"])

    return masked
