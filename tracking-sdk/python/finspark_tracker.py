import time
import requests
import functools
import threading
from typing import Optional, Dict, Any
from fastapi import Request

class FinsparkTracker:
    """
    Interceptor-based SDK for Backend APIs (Python / FastAPI) and batch processes.
    Automatically captures API traffic or batched routines and flushes them 
    to the Finspark tracking API endpoint.
    """
    def __init__(self, tenant_id: str, endpoint: str = "http://localhost:5000/api/track"):
        self.tenant_id = tenant_id
        self.endpoint = endpoint
        self._buffer = []
        self._lock = threading.Lock()

    def track_event(self, event_data: Dict[str, Any]):
        """Queue event to be sent asynchronously."""
        with self._lock:
            self._buffer.append({
                "tenant_id": self.tenant_id,
                "timestamp": event_data.get("timestamp") or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                "channel": event_data.get("channel", "api"),
                "l3_feature": event_data.get("l3_feature", "unknown_feature"),
                "session_id": event_data.get("session_id", "backend-sys"),
                "user_id": event_data.get("user_id"),
                "success": event_data.get("success", True),
                "duration_ms": event_data.get("duration_ms", 0)
            })
            if len(self._buffer) >= 10:
                self.flush()

    def flush(self):
        """Send queued events."""
        with self._lock:
            if not self._buffer:
                return
            batch = self._buffer.copy()
            self._buffer.clear()
        
        def push():
            try:
                requests.post(f"{self.endpoint}/bulk", json={"events": batch})
            except Exception:
                pass # Silent fail to not block critical workflows
        
        threading.Thread(target=push).start()

    async def fastapi_middleware(self, request: Request, call_next):
        """FastAPI Middleware to track all API requests automatically."""
        start_time = time.perf_counter()
        response = None
        success = False
        try:
            response = await call_next(request)
            success = response.status_code < 400
            return response
        finally:
            duration = int((time.perf_counter() - start_time) * 1000)
            feature_name = f"{request.method} {request.url.path}"
            # Extract standard session if possible
            session_id = request.headers.get("x-session-id", "api_session")
            
            self.track_event({
                "channel": "api",
                "l3_feature": feature_name,
                "session_id": session_id,
                "duration_ms": duration,
                "success": success
            })

# Batch decorator
def track_batch(tracker: FinsparkTracker, feature_name: str):
    """Decorator to track batch processing functions."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            success = True
            try:
                return func(*args, **kwargs)
            except Exception:
                success = False
                raise
            finally:
                duration = int((time.perf_counter() - start) * 1000)
                tracker.track_event({
                    "channel": "batch",
                    "l3_feature": feature_name,
                    "duration_ms": duration,
                    "success": success
                })
                # For batch jobs, force flush immediately
                tracker.flush()
        return wrapper
    return decorator
