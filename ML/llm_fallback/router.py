"""
LLM Fallback Router for Finspark Intelligence.

Routes low-confidence ensemble predictions to an LLM for qualitative reasoning.
Supports two backends:
  - On-prem: Ollama (llama3:70b)
  - Cloud:   OpenAI GPT-4o

Retry policy: 3 attempts with exponential backoff (1s, 2s, 4s).
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Retry constants
# ---------------------------------------------------------------------------
MAX_RETRIES    = 3
BACKOFF_BASE   = 1.0   # seconds


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _retry(fn, max_retries: int = MAX_RETRIES, backoff_base: float = BACKOFF_BASE):
    """
    Call ``fn()`` up to ``max_retries`` times with exponential backoff.

    Args:
        fn:          Callable with no arguments.
        max_retries: Maximum number of attempts.
        backoff_base: Initial wait in seconds; doubles each retry.

    Returns:
        Return value of ``fn`` on success.

    Raises:
        The last exception raised by ``fn`` if all attempts fail.
    """
    last_exc: Optional[Exception] = None
    for attempt in range(1, max_retries + 1):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            wait = backoff_base * (2 ** (attempt - 1))
            logger.warning(
                f"LLM call attempt {attempt}/{max_retries} failed: {exc}. "
                f"Retrying in {wait:.1f}s..."
            )
            time.sleep(wait)
    raise last_exc  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------

class LLMRouter:
    """
    Routes low-confidence ensemble predictions to an LLM for qualitative
    reasoning and suggested actions.

    Args:
        deployment_mode: ``"cloud"`` (GPT-4o via OpenAI) or
                         ``"on_prem"`` (LLaMA 3 via Ollama).
        config:          Configuration dict.  Expects optional keys:
                         ``llm_routing.cloud``, ``llm_routing.on_prem``,
                         ``ollama_base_url`` (default ``http://localhost:11434``),
                         ``openai_api_key`` (falls back to ``OPENAI_API_KEY`` env var).
        max_retries:     Number of LLM call retries (default 3).

    Raises:
        ValueError: If ``deployment_mode`` is not ``"cloud"`` or ``"on_prem"``.

    Example::

        router = LLMRouter(deployment_mode="cloud", config=cfg)
        result = router.route(prediction_context=pred, user_question="Why might this user churn?")
    """

    SYSTEM_PROMPT = (
        "You are a feature intelligence analyst for an enterprise lending platform. "
        "You receive partial model predictions and must explain the churn risk and "
        "recommended product action in 2-3 sentences. "
        "Be specific about which feature caused the most friction. "
        "If confidence is very low, acknowledge the uncertainty explicitly."
    )

    def __init__(
        self,
        deployment_mode: str,
        config: Dict[str, Any],
        max_retries: int = MAX_RETRIES,
    ) -> None:
        if deployment_mode not in ("cloud", "on_prem"):
            raise ValueError(
                f"deployment_mode must be 'cloud' or 'on_prem', got '{deployment_mode}'"
            )
        self.deployment_mode = deployment_mode
        self.config = config
        self.max_retries = max_retries

        routing = config.get("llm_routing", {})
        self._cloud_model   = routing.get("cloud", "gpt-4o")
        self._onprem_model  = routing.get("on_prem", "llama3:70b")
        self._ollama_url    = config.get("ollama_base_url", "http://localhost:11434")
        self._openai_key    = config.get("openai_api_key") or _env("OPENAI_API_KEY", "")

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def route(
        self,
        prediction_context: Dict[str, Any],
        user_question: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Build a structured prompt from the prediction context, route to the
        appropriate LLM, and parse the response into an action recommendation.

        Args:
            prediction_context: Output dict from
                                :meth:`~models.ensemble.PredictionEnsemble.predict`.
            user_question:      Optional override question.  If ``None``, a
                                default churn-risk question is constructed.

        Returns:
            Dict with:
              - ``"llm_answer"``       (str)  – LLM-generated explanation
              - ``"suggested_action"`` (str)  – extracted action phrase
              - ``"model_used"``       (str)  – model identifier
              - ``"latency_ms"``       (int)  – wall-clock generation time
        """
        prompt = self._build_prompt(prediction_context, user_question)
        model_used = (
            self._cloud_model if self.deployment_mode == "cloud" else self._onprem_model
        )

        t0 = time.perf_counter()
        try:
            if self.deployment_mode == "cloud":
                raw_answer = _retry(lambda: self._call_openai(prompt), self.max_retries)
            else:
                raw_answer = _retry(lambda: self._call_ollama(prompt), self.max_retries)
        except Exception as exc:
            logger.error(f"LLM fallback exhausted all retries: {exc}")
            raw_answer = (
                f"[LLM unavailable after {self.max_retries} retries: {exc}] "
                "Manual review recommended based on ensemble scores."
            )

        latency_ms = int((time.perf_counter() - t0) * 1000)

        suggested_action = _extract_action(raw_answer, prediction_context)

        logger.info(
            json.dumps({
                "event": "llm_fallback_routed",
                "model": model_used,
                "latency_ms": latency_ms,
                "churn_probability": prediction_context.get("churn_probability"),
                "confidence": prediction_context.get("confidence"),
            })
        )

        return {
            "llm_answer":       raw_answer,
            "suggested_action": suggested_action,
            "model_used":       model_used,
            "latency_ms":       latency_ms,
        }

    # ------------------------------------------------------------------
    # Prompt construction
    # ------------------------------------------------------------------

    def _build_prompt(
        self,
        context: Dict[str, Any],
        user_question: Optional[str] = None,
    ) -> str:
        """
        Assemble a structured prompt from the ensemble prediction context.

        Sections included:
          1. System persona
          2. Session sequence
          3. Model score breakdown
          4. Why confidence was low
          5. Top friction features
          6. User question (or default)

        Args:
            context:       Ensemble prediction dict.
            user_question: Optional natural language question.

        Returns:
            Multi-line prompt string ready for LLM consumption.
        """
        seq       = context.get("session_sequence", context.get("sequence", []))
        churn_p   = context.get("churn_probability", "N/A")
        conf      = context.get("confidence", "N/A")
        breakdown = context.get("model_breakdown", {})
        friction  = context.get("feature_risk_map", {})

        # Format model scores
        score_lines = []
        for model_name, info in breakdown.items():
            score = info.get("score", "N/A")
            extra = ""
            if model_name == "ngram" and info.get("anomaly_flag"):
                extra = " ⚠ ANOMALY"
            if model_name == "markov":
                extra = f" (top friction: {info.get('top_friction', 'N/A')})"
            score_lines.append(f"  - {model_name.upper()}: {score}{extra}")

        # Top friction features (max 3)
        friction_lines = [
            f"  - {feat}: {round(prob*100, 1)}% drop-off probability"
            for feat, prob in sorted(friction.items(), key=lambda x: -x[1])[:3]
        ]

        q = user_question or (
            "Explain the primary churn risk factor for this user session "
            "and what product/UX action should be taken."
        )

        prompt = (
            f"SYSTEM: {self.SYSTEM_PROMPT}\n\n"
            f"=== SESSION CONTEXT ===\n"
            f"Feature sequence:    {' → '.join(seq) if seq else 'N/A'}\n"
            f"Ensemble churn prob: {churn_p}\n"
            f"Ensemble confidence: {conf} (LOW — LLM fallback triggered)\n\n"
            f"=== MODEL BREAKDOWN ===\n"
            + "\n".join(score_lines) + "\n\n"
            f"=== TOP FRICTION FEATURES ===\n"
            + ("\n".join(friction_lines) if friction_lines else "  None detected") + "\n\n"
            f"=== QUESTION ===\n{q}\n\n"
            f"ANSWER (2-3 sentences):"
        )
        return prompt

    # ------------------------------------------------------------------
    # LLM backends
    # ------------------------------------------------------------------

    def _call_openai(self, prompt: str) -> str:
        """
        Call OpenAI Chat Completions API (GPT-4o).

        Args:
            prompt: Assembled prompt string.

        Returns:
            Assistant message content string.

        Raises:
            Exception: Propagated from the OpenAI client on failure.
        """
        import openai  # local import to avoid mandatory dep on on-prem deployments
        client = openai.OpenAI(api_key=self._openai_key)
        response = client.chat.completions.create(
            model=self._cloud_model,
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.2,
            max_tokens=256,
        )
        return response.choices[0].message.content.strip()

    def _call_ollama(self, prompt: str) -> str:
        """
        Call a local Ollama server (LLaMA 3 / any compatible model).

        Uses the Ollama REST API at ``POST /api/generate``.

        Args:
            prompt: Assembled prompt string.

        Returns:
            Generated text string.

        Raises:
            RuntimeError: If the Ollama server returns a non-200 status.
        """
        import requests  # type: ignore

        url = f"{self._ollama_url.rstrip('/')}/api/generate"
        payload = {
            "model":  self._onprem_model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.2, "num_predict": 256},
        }
        resp = requests.post(url, json=payload, timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(
                f"Ollama returned {resp.status_code}: {resp.text[:200]}"
            )
        return resp.json().get("response", "").strip()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _env(key: str, default: str = "") -> str:
    import os
    return os.environ.get(key, default)


def _extract_action(answer: str, context: Dict[str, Any]) -> str:
    """
    Heuristically extract a short action phrase from the LLM answer,
    falling back to a rule-based recommendation if not parseable.

    Args:
        answer:  Raw LLM text response.
        context: Ensemble prediction dict (for rule-based fallback).

    Returns:
        One-line suggested action string.
    """
    # Look for action-oriented sentences
    sentences = [s.strip() for s in answer.replace("\n", " ").split(".") if s.strip()]
    action_keywords = ("recommend", "suggest", "should", "action", "flag",
                       "review", "contact", "simplify", "reduce", "send")
    for sent in sentences:
        if any(kw in sent.lower() for kw in action_keywords):
            return sent[:200]

    # Rule-based fallback
    churn_p = context.get("churn_probability", 0.5)
    if churn_p >= 0.75:
        return "Flag for immediate manual review — high churn risk."
    elif churn_p >= 0.50:
        return "Trigger proactive outreach campaign — moderate churn risk."
    else:
        return "Monitor session; no immediate action required."
