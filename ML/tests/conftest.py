from __future__ import annotations

import os
import sys
import tempfile
import uuid
import shutil
from pathlib import Path
import pytest


_LOCAL_TEMP = Path(__file__).resolve().parents[1] / ".tmp_runtime"
_LOCAL_TEMP.mkdir(parents=True, exist_ok=True)

for key in ("TMP", "TEMP", "TMPDIR"):
    os.environ[key] = str(_LOCAL_TEMP)

tempfile.tempdir = str(_LOCAL_TEMP)


def _safe_mkdtemp(suffix="", prefix="tmp", dir=None):
    base = Path(dir or tempfile.tempdir or _LOCAL_TEMP)
    base.mkdir(parents=True, exist_ok=True)

    while True:
        candidate = base / f"{prefix}{uuid.uuid4().hex}{suffix}"
        try:
            os.mkdir(candidate)
            return str(candidate)
        except FileExistsError:
            continue


class _SafeTemporaryDirectory:
    def __init__(self, suffix="", prefix="tmp", dir=None, ignore_cleanup_errors=False):
        self.name = _safe_mkdtemp(suffix=suffix, prefix=prefix, dir=dir)
        self._ignore_cleanup_errors = ignore_cleanup_errors

    def cleanup(self):
        shutil.rmtree(self.name, ignore_errors=self._ignore_cleanup_errors)

    def __enter__(self):
        return self.name

    def __exit__(self, exc_type, exc, tb):
        self.cleanup()
        return False


tempfile.mkdtemp = _safe_mkdtemp
tempfile.TemporaryDirectory = _SafeTemporaryDirectory


import llm_fallback as _llm_fallback  # noqa: E402
from llm_fallback import router as _llm_router  # noqa: E402

sys.modules.setdefault("llm_fallback", _llm_fallback)
sys.modules.setdefault("llm_fallback.router", _llm_router)
sys.modules["ML.llm_fallback"] = _llm_fallback
sys.modules["ML.llm_fallback.router"] = _llm_router


@pytest.fixture
def tmp_path():
    path = Path(_safe_mkdtemp(prefix="pytest_"))
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


class _TmpPathFactory:
    def mktemp(self, basename: str, numbered: bool = True) -> Path:
        prefix = f"{basename}_" if numbered else basename
        return Path(_safe_mkdtemp(prefix=prefix))


@pytest.fixture(scope="session")
def tmp_path_factory():
    return _TmpPathFactory()
