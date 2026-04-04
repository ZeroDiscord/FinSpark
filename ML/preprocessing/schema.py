"""
Pydantic schema definitions for Finspark Intelligence events.
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any

class FeatureEvent(BaseModel):
    tenant_id: str           # hashed
    session_id: str          # hashed
    user_id: str             # hashed (SHA-256 salted)
    timestamp: datetime
    deployment_type: str     # "cloud" | "on_prem"
    channel: str             # "web" | "mobile" | "api" | "batch"
    l1_domain: str           # e.g. "origination"
    l2_module: str           # e.g. "kyc_engine"
    l3_feature: str          # e.g. "auto_income_verification"
    l4_action: str           # e.g. "upload_pdf"
    l5_deployment_node: str  # e.g. "aws-us-east-1"
    duration_ms: Optional[int]
    success: Optional[bool]
    metadata: Dict[str, Any] # non-PII extras
