"""
Session Builder for Finspark Intelligence.

Groups a flat list of FeatureEvents into per-user sessions based on
temporal gaps, assigns deterministic session IDs, and converts sessions
to feature-name sequences for downstream NLP/sequence models.
"""

import hashlib
from datetime import timedelta
from typing import Dict, List, Tuple

from preprocessing.schema import FeatureEvent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _deterministic_session_id(user_id: str, session_start_iso: str) -> str:
    """
    Generate a reproducible session ID by hashing (user_id + session_start_time).

    Args:
        user_id: The (already hashed) user identifier.
        session_start_iso: ISO-8601 string of the session's first event timestamp.

    Returns:
        A 16-character hex prefix of the SHA-256 digest — short but collision-safe
        for typical event volumes.
    """
    raw = f"{user_id}|{session_start_iso}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_sessions(
    events: List[FeatureEvent],
    gap_minutes: int = 30,
) -> List[List[FeatureEvent]]:
    """
    Group a flat list of FeatureEvents into ordered, per-user sessions.

    Algorithm:
        1. Partition events by ``user_id``.
        2. Sort each user's events by ``timestamp`` (ascending).
        3. Walk through the sorted events: start a new session whenever
           the gap between consecutive events exceeds ``gap_minutes``.
        4. Assign a deterministic ``session_id`` to every event in the
           session (= hash of user_id + first-event timestamp).

    Args:
        events:      Flat list of :class:`~preprocessing.schema.FeatureEvent`
                     objects, possibly from multiple users and sessions.
        gap_minutes: Inactivity threshold in minutes that splits sessions.
                     Defaults to 30.

    Returns:
        A list of sessions; each session is an ordered list of
        :class:`~preprocessing.schema.FeatureEvent` objects.

    Example::

        sessions = build_sessions(all_events, gap_minutes=30)
        for session in sessions:
            print([e.l3_feature for e in session])
    """
    gap = timedelta(minutes=gap_minutes)

    # Group events by user
    user_buckets: Dict[str, List[FeatureEvent]] = {}
    for event in events:
        user_buckets.setdefault(event.user_id, []).append(event)

    all_sessions: List[List[FeatureEvent]] = []

    for user_id, user_events in user_buckets.items():
        # Sort chronologically (timestamps may be tz-aware or naive)
        sorted_events = sorted(user_events, key=lambda e: e.timestamp)

        current_session: List[FeatureEvent] = []

        for event in sorted_events:
            if not current_session:
                current_session.append(event)
            else:
                delta = event.timestamp - current_session[-1].timestamp
                if delta > gap:
                    # Finalise the current session and attach deterministic IDs
                    _stamp_session(current_session)
                    all_sessions.append(current_session)
                    current_session = [event]
                else:
                    current_session.append(event)

        # Don't forget the last open session
        if current_session:
            _stamp_session(current_session)
            all_sessions.append(current_session)

    return all_sessions


def _stamp_session(session: List[FeatureEvent]) -> None:
    """
    Mutate every event in a session slice to carry the same deterministic
    ``session_id`` derived from the first event's (user_id, timestamp).

    Args:
        session: A non-empty list of :class:`~preprocessing.schema.FeatureEvent`
                 objects, sorted by timestamp.
    """
    first = session[0]
    sid = _deterministic_session_id(
        first.user_id,
        first.timestamp.isoformat(),
    )
    for event in session:
        # Pydantic models are frozen by default in v2; use model_copy
        # For simplicity and compatibility we update via object __dict__
        object.__setattr__(event, "session_id", sid)


def sessions_to_sequences(
    sessions: List[List[FeatureEvent]],
) -> List[List[str]]:
    """
    Convert each session into an ordered list of ``l3_feature`` token strings.

    This is the primary vocabulary representation for n-gram, Markov, and
    LSTM models. Each session becomes one sequence; repeated features within
    a session are preserved (they carry positional meaning).

    Args:
        sessions: Output of :func:`build_sessions`.

    Returns:
        A list of token sequences.  Example::

            [
                ["kyc_check", "doc_upload", "bureau_pull", "disbursement"],
                ["kyc_check", "doc_upload", "drop_off"],
            ]

    Note:
        Events with ``None`` or empty ``l3_feature`` are silently skipped
        to avoid polluting the vocabulary.
    """
    sequences: List[List[str]] = []
    for session in sessions:
        tokens = [
            e.l3_feature
            for e in session
            if e.l3_feature and e.l3_feature.strip()
        ]
        if tokens:
            sequences.append(tokens)
    return sequences
