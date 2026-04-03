import pandas as pd
import logging
import difflib
from typing import List, Dict, Any, Optional
from preprocessing.schema import FeatureEvent
from preprocessing.pii_masker import mask_event

logger = logging.getLogger(__name__)

def convert_to_schema(df: pd.DataFrame, detection_result: Dict[str, Any], llm_client=None) -> List[FeatureEvent]:
    """
    Branch on detection_result["recommended_action"]:
    
    direct_map: rename columns using a field map, cast types, return
    
    regex_convert: use a fuzzy field matcher (difflib.get_close_matches) 
      to map detected_columns -> FeatureEvent fields with >0.7 similarity
    
    llm_convert: build a prompt showing the first 3 rows of the dataframe
      and asking the LLM to return a JSON field mapping dict like:
      {"source_col": "target_field", ...}
      Then apply that mapping to the full dataframe.
      
    All branches must call pii_masker.mask_event() before returning.
    """
    action = detection_result.get("recommended_action")
    detected_columns = detection_result.get("detected_columns", [])
    
    expected_fields = [
        "tenant_id", "session_id", "user_id", "timestamp", "deployment_type",
        "channel", "l1_domain", "l2_module", "l3_feature", "l4_action",
        "l5_deployment_node", "duration_ms", "success", "metadata"
    ]
    
    mapping = {}
    
    if action == "direct_map":
        # Keep columns that are in expected_fields verbatim
        mapping = {col: col for col in detected_columns if col in expected_fields}
        
    elif action == "regex_convert":
        for col in detected_columns:
            matches = difflib.get_close_matches(col, expected_fields, n=1, cutoff=0.7)
            if matches:
                mapping[col] = matches[0]
                
    elif action == "llm_convert":
        if llm_client is None:
            raise ValueError("llm_client required for llm_convert action")
            
        sample_data = df.head(3).to_dict(orient="records")
        prompt = f"""
        Map the following data columns to our internal schema fields.
        Schema fields: {expected_fields}
        Data sample: {sample_data}
        
        Return ONLY a JSON mapping dict in the format:
        {{"source_column_name": "target_schema_field"}}
        """
        try:
            # Placeholder for llm_client call
            # response = llm_client.predict(prompt)
            # mapping = json.loads(response)
            logger.warning("LLM logic requires an active client. Using empty mapping.")
            mapping = {} 
        except Exception as e:
            logger.error(f"LLM mapping failed: {e}")
            mapping = {}
            
    else:
        raise ValueError(f"Unknown recommended action: {action}")
        
    # Apply mapping
    mapped_df = df.rename(columns=mapping)
    
    events = []
    # Fill in required fields if missing, then validate
    for row in mapped_df.to_dict(orient="records"):
        # We ensure metadata is a dict, and missing required strings are handled loosely here
        # Normally would have a more robust fallback/default logic.
        
        event_dict = {}
        for field in expected_fields:
            if field in row and not pd.isna(row[field]):
                event_dict[field] = row[field]
            elif field == "metadata":
                event_dict[field] = {}
        
        # Apply PII Masking
        masked_event = mask_event(event_dict)
        
        try:
            # We enforce Pydantic validation
            feature_event = FeatureEvent(**masked_event)
            events.append(feature_event)
        except Exception as e:
            logger.warning(f"Skipping row due to validation error: {e}")
            
    return events
