import pandas as pd
import json
import os
from typing import Dict, Any

def detect_format(filepath: str) -> Dict[str, Any]:
    """
    Reads the first 20 rows of a CSV/JSON/Excel file.
    Returns:
    {
      "format": "csv" | "json" | "excel",
      "detected_columns": [...],
      "match_score": float,         # 0-1, how well it maps to FeatureEvent
      "missing_fields": [...],
      "extra_fields": [...],
      "recommended_action": "direct_map" | "llm_convert" | "regex_convert"
    }
    
    Match logic:
    - If >80% of FeatureEvent fields are present verbatim -> "direct_map"
    - If fields are present but named differently -> "regex_convert"  
    - If schema is completely foreign -> "llm_convert"
    """
    detected_format = None
    df = None
    
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")
        
    try:
        if filepath.lower().endswith('.csv'):
            df = pd.read_csv(filepath, nrows=20)
            detected_format = "csv"
        elif filepath.lower().endswith('.json'):
            with open(filepath, 'r') as f:
                data = json.load(f)
                if isinstance(data, list):
                    df = pd.DataFrame(data[:20])
                else:
                    df = pd.DataFrame([data])
            detected_format = "json"
        elif filepath.lower().endswith(('.xlsx', '.xls')):
            df = pd.read_excel(filepath, nrows=20)
            detected_format = "excel"
        else:
            raise ValueError("Unsupported format. Must be .csv, .json, or .xlsx/.xls")
    except Exception as e:
        raise ValueError(f"Failed to parse file {filepath}: {e}")

    detected_columns = list(df.columns)
    
    expected_fields = {
        "tenant_id", "session_id", "user_id", "timestamp", "deployment_type",
        "channel", "l1_domain", "l2_module", "l3_feature", "l4_action",
        "l5_deployment_node", "duration_ms", "success", "metadata"
    }
    
    matched_fields = set(detected_columns).intersection(expected_fields)
    missing_fields = list(expected_fields - set(detected_columns))
    extra_fields = list(set(detected_columns) - expected_fields)
    
    match_score = len(matched_fields) / len(expected_fields) if expected_fields else 0.0
    
    if match_score > 0.8:
        recommended_action = "direct_map"
    elif match_score > 0.0:
        recommended_action = "regex_convert"
    else:
        recommended_action = "llm_convert"
        
    return {
        "format": detected_format,
        "detected_columns": detected_columns,
        "match_score": match_score,
        "missing_fields": missing_fields,
        "extra_fields": extra_fields,
        "recommended_action": recommended_action
    }
