import logging
from typing import Dict, List, Optional
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

class TaxonomyInterpreter:
    """
    Takes outputs from PredictionEnsemble and produces a structured
    interpretability report aligned to the L1-L5 feature taxonomy.
    """

    def interpret(
        self,
        session_sequence: List[str],
        ensemble_output: Dict,
        markov,
        ngram,
        churn_conditionals: Dict[str, float],
        cooccurrence_matrix: Optional[pd.DataFrame],
        taxonomy_map: Dict[str, Dict],
        session_events: Optional[List[Dict]] = None
    ) -> Dict:
        """
        Returns the full interpretability report.
        """
        l1_risk = self._l1_domain_risk(session_sequence, churn_conditionals, taxonomy_map)
        l2_risk = self._l2_module_risk(session_sequence, churn_conditionals, taxonomy_map)
        l3_risk = self._l3_feature_risk(session_sequence, churn_conditionals, markov)
        l4_anomaly = self._l4_action_anomaly(session_sequence, ngram)
        l5_signal = self._l5_deployment_signal(session_events) if session_events else {}

        narrative, recommendations = self._build_narrative(l3_risk, l4_anomaly, l5_signal, ensemble_output, l1_risk)

        churn_prob = ensemble_output.get("churn_probability", 0.5)
        if churn_prob > 0.75:
            band = "critical"
        elif churn_prob > 0.55:
            band = "high"
        elif churn_prob > 0.35:
            band = "medium"
        else:
            band = "low"

        # Safe completion probability logic
        completion_prob = 0.5
        if markov and hasattr(markov, "absorption_probability") and session_sequence:
            last_feat = session_sequence[-1]
            # Assuming 'disbursement' is the successful completion state
            try:
                completion_prob = markov.absorption_probability(last_feat, "disbursement")
            except Exception:
                pass

        return {
            "session_id": "N/A",  # Added later if available
            "churn_probability": round(float(churn_prob), 4),
            "churn_risk_band": band,
            "confidence": ensemble_output.get("confidence", 0.0),
            "narrative": narrative,
            "taxonomy_breakdown": {
                "l1_domain_risk": l1_risk,
                "l2_module_risk": l2_risk,
                "l3_feature_risk": l3_risk,
                "l4_action_anomaly": l4_anomaly,
                "l5_deployment_signal": l5_signal
            },
            "top_friction_features": [f["feature"] for f in l3_risk[:3]],
            "journey_path": session_sequence,
            "journey_completion_probability": round(float(completion_prob), 4),
            "recommended_actions": recommendations
        }

    def _l1_domain_risk(self, sequence: List[str], churn_conditionals: Dict[str, float], taxonomy_map: Dict[str, Dict]) -> Dict[str, float]:
        domain_risks = {}
        domain_counts = {}
        for feat in sequence:
            domain = taxonomy_map.get(feat, {}).get("l1_domain", "unknown")
            risk = churn_conditionals.get(feat, 0.0)
            domain_risks[domain] = domain_risks.get(domain, 0.0) + risk
            domain_counts[domain] = domain_counts.get(domain, 0) + 1
            
        return {domain: round(risk / count, 4) for domain, (risk, count) in zip(domain_risks.keys(), zip(domain_risks.values(), domain_counts.values()))}

    def _l2_module_risk(self, sequence: List[str], churn_conditionals: Dict[str, float], taxonomy_map: Dict[str, Dict]) -> List[Dict]:
        modules = {}
        for feat in sequence:
            mod = taxonomy_map.get(feat, {}).get("l2_module", "unknown")
            if mod not in modules:
                modules[mod] = {"features_invoked": set(), "invocation_count": 0, "risk_sum": 0.0}
            modules[mod]["features_invoked"].add(feat)
            modules[mod]["invocation_count"] += 1
            modules[mod]["risk_sum"] += churn_conditionals.get(feat, 0.0)

        results = []
        for mod, data in modules.items():
            count = data["invocation_count"]
            risk = data["risk_sum"] / count if count > 0 else 0.0
            adoption = "high" if count >= 5 else "medium" if count >= 2 else "low"
            results.append({
                "module": mod,
                "features_invoked": list(data["features_invoked"]),
                "invocation_count": count,
                "churn_risk": round(risk, 4),
                "adoption_signal": adoption
            })
        return results

    def _l3_feature_risk(self, sequence: List[str], churn_conditionals: Dict[str, float], markov) -> List[Dict]:
        unique_feats = set(sequence)
        results = []
        
        friction_map = {}
        if markov and hasattr(markov, "get_friction_features"):
            try:
                friction_map = {f["feature"]: f["drop_off_prob"] for f in markov.get_friction_features(threshold=0.0, drop_off_state="drop_off")}
            except Exception:
                pass

        for feat in unique_feats:
            invocations = sequence.count(feat)
            churn_prob = churn_conditionals.get(feat, 0.0)
            drop_off_prob = friction_map.get(feat, 0.0)
            
            is_friction = drop_off_prob > 0.20
            severity = "critical" if drop_off_prob > 0.40 else "moderate" if drop_off_prob > 0.20 else "low"
            
            results.append({
                "feature": feat,
                "times_invoked": invocations,
                "churn_probability": round(churn_prob, 4),
                "drop_off_probability": round(drop_off_prob, 4),
                "is_friction_point": is_friction,
                "friction_severity": severity
            })
            
        return sorted(results, key=lambda x: x["churn_probability"], reverse=True)

    def _l4_action_anomaly(self, sequence: List[str], ngram) -> List[Dict]:
        if not ngram or not sequence:
            return []
            
        results = []
        window_size = ngram.n
        
        all_scores = []
        for i in range(len(sequence)):
            start = max(0, i - window_size + 1)
            end = i + 1
            window = sequence[start:end]
            try:
                score = ngram.score_sequence(window)
            except Exception:
                score = 0.0
            all_scores.append(score)
            
        if not all_scores:
            return []
            
        mean_score = np.mean(all_scores)
        std_score = np.std(all_scores)
        threshold = mean_score + 1.5 * std_score
        
        for i, (feat, score) in enumerate(zip(sequence, all_scores)):
            results.append({
                "step_index": i,
                "feature": feat,
                "action": "invocation",
                "anomaly_score": round(float(score), 4),
                "is_anomalous": bool(score > threshold and score > 0.1)
            })
            
        return results

    def _l5_deployment_signal(self, session_events: List[Dict]) -> Dict:
        if not session_events:
            return {}
            
        node_stats = {}
        for event in session_events:
            node = event.get("l5_deployment_node", "unknown")
            dur = event.get("duration_ms")
            suc = event.get("success", True)
            
            if node not in node_stats:
                node_stats[node] = {"durations": [], "errors": 0, "total": 0}
                
            node_stats[node]["total"] += 1
            if dur is not None:
                node_stats[node]["durations"].append(dur)
            if not suc:
                node_stats[node]["errors"] += 1
                
        # Find global mean duration
        all_durs = [d for stats in node_stats.values() for d in stats["durations"]]
        global_mean = np.mean(all_durs) if all_durs else 0.0
        
        results = {}
        for node, stats in node_stats.items():
            avg_dur = np.mean(stats["durations"]) if stats["durations"] else 0.0
            err_rate = stats["errors"] / stats["total"] if stats["total"] > 0 else 0.0
            latency_flag = bool(global_mean > 0 and avg_dur > 2 * global_mean)
            
            note = "Normal performance"
            if latency_flag:
                ratio = avg_dur / global_mean
                note = f"Node shows {ratio:.1f}x latency vs global baseline"
                
            results[node] = {
                "deployment_node": node,
                "avg_duration_ms": round(float(avg_dur), 2),
                "error_rate": round(float(err_rate), 4),
                "latency_flag": latency_flag,
                "note": note
            }
            
        # Return the signal for the primary (most frequent) node in this session
        primary_node = max(node_stats.keys(), key=lambda k: node_stats[k]["total"]) if node_stats else "unknown"
        return results.get(primary_node, {})

    def _build_narrative(self, l3_risks, l4_anomalies, l5_signal, ensemble_output, l1_risk) -> tuple[str, List[str]]:
        top_friction = l3_risks[0] if l3_risks else None
        churn_prob = ensemble_output.get("churn_probability", 0.0)
        
        narrative_parts = []
        recommendations = []
        
        if top_friction:
            narrative_parts.append(f"The session shows friction at {top_friction['feature']} (drop-off probability {top_friction['drop_off_probability']*100:.0f}%).")
            if top_friction['friction_severity'] == 'critical':
                recommendations.append(f"Investigate {top_friction['feature']} drop-off \u2014 consider UX simplification or timeout extension.")
            elif top_friction['friction_severity'] == 'moderate':
                recommendations.append(f"Review funnel analytics for {top_friction['feature']} to identify user hesitations.")
                
        anomalous_steps = [a for a in l4_anomalies if a["is_anomalous"]]
        if anomalous_steps:
            first_anomaly = anomalous_steps[0]
            narrative_parts.append(f"There is an anomalous transition arriving at {first_anomaly['feature']}.")
            # Next feature context if available
            next_feat = l4_anomalies[first_anomaly['step_index'] + 1]['feature'] if first_anomaly['step_index'] + 1 < len(l4_anomalies) else "drop_off"
            recommendations.append(f"Review {first_anomaly['feature']} \u2192 {next_feat} transition \u2014 unexpected path detected.")
            
        narrative_parts.append(f"The combined churn risk is {churn_prob*100:.0f}%.")
        
        if l1_risk:
            primary_domain = max(l1_risk.items(), key=lambda x: x[1])
            narrative_parts.append(f"Risk is driven primarily by the {primary_domain[0]} domain.")
            
        if l5_signal and l5_signal.get("latency_flag"):
            node = l5_signal.get("deployment_node")
            recommendations.append(f"Check {node} connectivity \u2014 latency 2x above baseline.")
            
        if churn_prob > 0.75:
            recommendations.append("Flag for relationship manager outreach.")
            
        narrative = " ".join(narrative_parts[:3])  # Max 3 sentences
        recommendations = recommendations[:3]      # Max 3 recommendations
        
        return narrative, recommendations
