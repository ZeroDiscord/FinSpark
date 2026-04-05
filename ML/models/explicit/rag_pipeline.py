"""
RAG Pipeline for Feature Intelligence using ChromaDB + Sentence-Transformers.

Implements a Retrieval-Augmented Generation (RAG) pipeline that:
  1. Indexes feature metadata and analyzed feedback into a persistent ChromaDB collection
  2. Answers natural language questions about feature adoption and churn risk
  3. Routes LLM generation to LLaMA (on-prem) or GPT-4o (cloud) based on deployment mode
"""

from __future__ import annotations

import json
import os
import uuid
from typing import Any, Dict, List, Optional

import pandas as pd

# Lazy-load heavy deps
_chromadb = None
_SentenceTransformer = None


def _get_chromadb():
    global _chromadb
    if _chromadb is None:
        import chromadb as _c
        _chromadb = _c
    return _chromadb


def _get_sentence_transformer(model_name: str):
    global _SentenceTransformer
    if _SentenceTransformer is None:
        from sentence_transformers import SentenceTransformer as _ST
        _SentenceTransformer = _ST
    return _SentenceTransformer(model_name)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VECTORSTORE_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "vectorstore"
)
DEFAULT_EMBED_MODEL = "all-MiniLM-L6-v2"


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_rag_prompt(question: str, context_chunks: List[str]) -> str:
    """
    Construct the final prompt sent to the LLM.

    Args:
        question:       The original natural language question.
        context_chunks: Retrieved document strings from the vector store.

    Returns:
        Formatted prompt string.
    """
    context_block = "\n\n---\n\n".join(
        f"[Context {i+1}]\n{chunk}" for i, chunk in enumerate(context_chunks)
    )
    return (
        "You are a financial-tech product intelligence assistant analyzing user journeys.\n"
        "Use the following retrieved context to answer the question.\n"
        "If the context is insufficient, explicitly state so.\n\n"
        "CRITICAL FORMATTING RULES:\n"
        "1. You MUST provide your answer in exactly 2 to 3 actionable, pointwise bullet points.\n"
        "2. Do NOT write introductory or concluding paragraphs. Just immediately output the bullet points.\n"
        "3. Use standard Markdown bullets (e.g. - Point 1).\n\n"
        f"CONTEXT:\n{context_block}\n\n"
        f"QUESTION: {question}\n\n"
        "ANSWER:"
    )


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------

class FeatureRAGPipeline:
    """
    Retrieval-Augmented Generation pipeline backed by ChromaDB and
    Sentence-Transformers.

    The pipeline maintains two logical document types inside a single
    ChromaDB collection differentiated by a ``type`` metadata field:
      - ``"feature"``  → feature descriptions, usage stats, sentiment summaries
      - ``"feedback"`` → individual or aggregated user feedback entries

    Storage:
        ChromaDB data is persisted to ``data/vectorstore/`` (relative to the
        project root) so indexes survive process restarts.

    Args:
        collection_name: ChromaDB collection name.  Defaults to
                         ``"feature_intelligence"``.
        embed_model:     Sentence-Transformers model name.  Defaults to
                         ``"all-MiniLM-L6-v2"``.

    Example::

        pipeline = FeatureRAGPipeline()
        pipeline.index_features([{
            "id": "kyc_check",
            "description": "Automated KYC verification step",
            "usage_count": 1500,
            "churn_rate": 0.12,
        }])
        results = pipeline.query("Which feature has the highest drop-off?")
    """

    def __init__(
        self,
        collection_name: str = "feature_intelligence",
        embed_model: str = DEFAULT_EMBED_MODEL,
    ) -> None:
        chroma = _get_chromadb()

        # Persist to disk
        os.makedirs(VECTORSTORE_PATH, exist_ok=True)
        self.client = chroma.PersistentClient(path=VECTORSTORE_PATH)

        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        self.embedder = _get_sentence_transformer(embed_model)
        self._embed_model_name = embed_model

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------

    def index_features(self, features: List[Dict[str, Any]]) -> None:
        """
        Ingest feature metadata documents into the vector store.

        Each feature dict is serialised into a human-readable document string:
        ``"Feature: <id>. Description: <desc>. Usage: <n>. Churn rate: <c>."``
        plus any additional keys are appended as key=value pairs.

        Required keys (others are forwarded as metadata):
            - ``id``          (str)  — unique feature identifier (L3 name)
            - ``description`` (str)  — human-readable feature description

        Optional keys:
            - ``usage_count`` (int)
            - ``churn_rate``  (float)
            - ``sentiment_summary`` (str)

        Args:
            features: List of feature metadata dicts.

        Raises:
            ValueError: If any feature dict is missing the ``"id"`` key.
        """
        if not features:
            return

        documents, ids, metadatas, embeddings_list = [], [], [], []

        for feat in features:
            if "id" not in feat:
                raise ValueError(f"Feature dict missing required 'id' key: {feat}")

            feat_id = str(feat["id"])
            desc = feat.get("description", "No description provided.")
            usage = feat.get("usage_count", "N/A")
            churn = feat.get("churn_rate", "N/A")
            sentiment = feat.get("sentiment_summary", "")

            doc = (
                f"Feature: {feat_id}. "
                f"Description: {desc}. "
                f"Usage count: {usage}. "
                f"Churn rate: {churn}."
            )
            if sentiment:
                doc += f" User sentiment: {sentiment}."

            # Append any extra metadata keys
            extra = {
                k: str(v) for k, v in feat.items()
                if k not in ("id", "description", "usage_count", "churn_rate", "sentiment_summary")
            }
            if extra:
                doc += " " + " ".join(f"{k}: {v}." for k, v in extra.items())

            meta = {
                "type": "feature",
                "feature_id": feat_id,
                "usage_count": str(usage),
                "churn_rate": str(churn),
            }
            meta.update({k: str(v) for k, v in extra.items()})

            doc_id = f"feat_{feat_id}"
            embedding = self.embedder.encode(doc).tolist()

            documents.append(doc)
            ids.append(doc_id)
            metadatas.append(meta)
            embeddings_list.append(embedding)

        # Upsert to handle re-indexing
        self.collection.upsert(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
            embeddings=embeddings_list,
        )

    def index_feedback(self, feedback_df: pd.DataFrame) -> None:
        """
        Ingest analyzed feedback rows from a DataFrame into the vector store.

        Required columns: any text column; ideally one of ``["feedback_text",
        "text", "comment", "review"]``.  Optional columns:
        ``["sentiment", "sentiment_score", "churn_signal", "feature_mentions"]``.

        Each row becomes one ChromaDB document.

        Args:
            feedback_df: DataFrame produced (or enriched) by
                         :class:`~models.explicit.sentiment.FeedbackAnalyzer`.

        Raises:
            ValueError: If no usable text column is found.
        """
        if feedback_df is None or feedback_df.empty:
            return

        # Auto-detect text column
        text_col = None
        for candidate in ("feedback_text", "text", "comment", "review", "message"):
            if candidate in feedback_df.columns:
                text_col = candidate
                break
        if text_col is None:
            raise ValueError(
                "No usable text column found. Expected one of: "
                "feedback_text, text, comment, review, message."
            )

        documents, ids, metadatas, embeddings_list = [], [], [], []

        for i, row in feedback_df.iterrows():
            text = str(row.get(text_col, "")) if pd.notna(row.get(text_col)) else ""
            if not text.strip():
                continue

            meta = {
                "type": "feedback",
                "sentiment": str(row.get("sentiment", "")),
                "sentiment_score": str(row.get("sentiment_score", "")),
                "churn_signal": str(row.get("churn_signal", "")),
                "feature_mentions": str(row.get("feature_mentions", "")),
            }

            doc_id = f"fb_{uuid.uuid4().hex[:12]}"
            embedding = self.embedder.encode(text).tolist()

            documents.append(text)
            ids.append(doc_id)
            metadatas.append(meta)
            embeddings_list.append(embedding)

        if documents:
            self.collection.upsert(
                ids=ids,
                documents=documents,
                metadatas=metadatas,
                embeddings=embeddings_list,
            )

    # ------------------------------------------------------------------
    # Retrieval
    # ------------------------------------------------------------------

    def query(self, question: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Semantic search over all indexed documents.

        Args:
            question: Natural language question or keyword query.
            top_k:    Number of results to return.

        Returns:
            List of dicts, each containing:
              - ``"document"`` (str): The stored document text.
              - ``"metadata"`` (dict): Stored metadata fields.
              - ``"distance"`` (float): Cosine distance (lower = more similar).
              - ``"id"``       (str): Document ID in the collection.

        Raises:
            ValueError: If ``top_k < 1``.
        """
        if top_k < 1:
            raise ValueError(f"top_k must be >= 1, got {top_k}")

        query_embedding = self.embedder.encode(question).tolist()

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, self.collection.count() or 1),
            include=["documents", "metadatas", "distances"],
        )

        hits = []
        for doc, meta, dist, doc_id in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
            results["ids"][0],
        ):
            hits.append({
                "document": doc,
                "metadata": meta,
                "distance": round(dist, 6),
                "id": doc_id,
            })

        return hits

    # ------------------------------------------------------------------
    # RAG Answer Generation
    # ------------------------------------------------------------------

    def generate_insight(
        self,
        question: str,
        deployment_mode: str = "cloud",
    ) -> Dict[str, Any]:
        """
        Full RAG loop: retrieve → prompt-build → LLM generate → structure answer.

        Routing logic:
          - We are standardizing on Gemini Flash (1.5 Flash) via `google.generativeai`.
          - OpenRouter support for GPT-4o, Ollama, Claude, etc., is implemented but 
            commented out, to be used in the actual environment.

        Args:
            question:        Natural language question about feature usage or churn.
            deployment_mode: (Ignored for now, defaults to Gemini).

        Returns:
            Dict with keys:
              - ``"answer"``         (str)        — generated text response
              - ``"source_features"`` (List[str]) — feature IDs in retrieved context
              - ``"confidence"``     (float)      — mean (1 - cosine_distance) of hits
              - ``"context_used"``   (List[str])  — raw context snippets passed to LLM
        """
        # 1. Retrieve
        hits = self.query(question, top_k=5)
        if not hits:
            return {
                "answer": "No relevant information found in the knowledge base.",
                "source_features": [],
                "confidence": 0.0,
                "context_used": [],
            }

        context_chunks = [h["document"] for h in hits]
        source_features = [
            h["metadata"].get("feature_id", "")
            for h in hits
            if h["metadata"].get("type") == "feature"
        ]
        source_features = [f for f in source_features if f]

        # Confidence = average semantic similarity
        similarity_scores = [1.0 - h["distance"] for h in hits]
        confidence = round(sum(similarity_scores) / len(similarity_scores), 4)

        # 2. Build prompt
        prompt = _build_rag_prompt(question, context_chunks)

        # 3. Route to LLM via OpenRouter
        answer = ""
        try:
            from openai import OpenAI

            openrouter_key = os.environ.get("OPENROUTER_API_KEY")
            if not openrouter_key:
                raise ValueError("OPENROUTER_API_KEY environment variable is not set.")

            client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=openrouter_key,
            )

            # Use a cost-efficient model available on OpenRouter
            target_model = (
                "meta-llama/llama-3.1-8b-instruct:free"
                if deployment_mode != "cloud"
                else "openai/gpt-4o-mini"
            )

            completion = client.chat.completions.create(
                model=target_model,
                temperature=0.2,
                max_tokens=512,
                messages=[{"role": "user", "content": prompt}],
            )
            answer = completion.choices[0].message.content.strip()

        except Exception as exc:
            err_str = str(exc)
            if "429" in err_str or "quota" in err_str.lower() or "rate" in err_str.lower():
                answer = (
                    "- **API Rate Limit**: OpenRouter request limit reached. "
                    "Retry in a moment.\n"
                    "- **Fallback Active**: Deterministic Markov friction signals are "
                    "shown in the insight panel instead."
                )
            elif "401" in err_str or "unauthorized" in err_str.lower():
                answer = (
                    "- **Auth Error**: OPENROUTER_API_KEY is invalid or missing.\n"
                    "- Set OPENROUTER_API_KEY in ML/.env to enable LLM attribution."
                )
            else:
                answer = (
                    f"- **LLM Generation Failed**: {err_str[:200]}\n"
                    "- Markov-derived friction insights remain available in the panel."
                )

        return {
            "answer": answer,
            "source_features": source_features,
            "confidence": confidence,
            "context_used": context_chunks,
        }

    # ------------------------------------------------------------------
    # Diagnostic helpers
    # ------------------------------------------------------------------

    def count(self) -> int:
        """Return total number of documents in the collection."""
        return self.collection.count()

    def clear(self) -> None:
        """
        Delete all documents from the collection.

        Use with caution — this is irreversible for the persistent store.
        """
        all_ids = self.collection.get()["ids"]
        if all_ids:
            self.collection.delete(ids=all_ids)
