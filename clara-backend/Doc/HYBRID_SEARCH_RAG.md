# Hybrid Search RAG System Architecture

## 1. Overview
This document outlines the architecture for a Hybrid Search RAG (Retrieval-Augmented Generation) system that combines semantic search (dense vectors) with keyword search (sparse vectors/BM25) to improve retrieval accuracy and relevance.

## 2. Core Components

### 2.1 Search Mechanisms
*   **Semantic Search (Dense Retrieval)**:
    *   **Model**: `text-embedding-3-small` (OpenAI) or `text-embedding-004` (Gemini).
    *   **Storage**: Qdrant (Dense Vector Index).
    *   **Purpose**: Captures conceptual meaning, synonyms, and intent.
*   **Keyword Search (Sparse Retrieval)**:
    *   **Algorithm**: BM25 (Best Matching 25).
    *   **Storage**: Qdrant (Sparse Vector Index) or Meilisearch/Elasticsearch.
    *   **Purpose**: Captures exact keyword matches, acronyms, and specific terminology.

### 2.2 Hybrid Search Strategy
*   **Reciprocal Rank Fusion (RRF)**:
    *   Combine results from Semantic and Keyword searches.
    *   **Formula**: `score = 1 / (k + rank_semantic) + 1 / (k + rank_keyword)`.
    *   **Weighting**: Configurable weights (alpha) to prioritize one method over the other (e.g., 0.7 Semantic + 0.3 Keyword).

### 2.3 Re-ranking (Optional but Recommended)
*   **Cross-Encoder Model**:
    *   **Model**: Cohere Rerank API or a local ONNX model (e.g., `ms-marco-MiniLM-L-6-v2`).
    *   **Process**: Take top-N (e.g., 50) results from Hybrid Search -> Re-score using Cross-Encoder -> Return top-K (e.g., 5) to LLM.
    *   **Benefit**: Significantly improves precision by evaluating the query-document pair directly.

### 2.4 Caching Layer
*   **Redis Cache**:
    *   **Key**: `hash(query + filters + user_id)`.
    *   **Value**: Compressed JSON of retrieved context.
    *   **TTL**: 1-24 hours depending on document volatility.
    *   **Invalidation**: On document update/delete.

## 3. Implementation Plan

### Phase 1: Sparse Vector Integration
1.  **Qdrant Config**: Enable sparse vector support in Qdrant collection.
2.  **Ingestion**:
    *   Compute sparse vectors (BM25) during ingestion alongside dense vectors.
    *   Use a library like `fast-embed` or `bm25-js` to generate sparse vectors.

### Phase 2: Hybrid Search Logic
1.  **Search API**: Update `/api/rag/search` to perform parallel searches (Dense + Sparse).
2.  **Fusion**: Implement RRF algorithm to merge results.
3.  **Filtering**: Apply metadata filters (e.g., `user_id`, `doc_id`) to both searches.

### Phase 3: Re-ranking & Caching
1.  **Re-ranker**: Integrate a re-ranking step.
2.  **Cache**: Implement Redis caching for search results.
