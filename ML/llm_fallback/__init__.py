"""LLM fallback package with import aliases for repo-root and package imports."""

from __future__ import annotations

import sys


if __name__ == "ML.llm_fallback":
    sys.modules.setdefault("llm_fallback", sys.modules[__name__])
