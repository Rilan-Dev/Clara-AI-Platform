# Production Migration Strategy: Clara AI RAG Platform

## 1. Executive Summary
This document outlines the comprehensive migration strategy to transform the current Clara AI RAG prototype into a production-ready, multi-LLM platform. The strategy focuses on scalability, reliability, and vendor neutrality, specifically enabling seamless switching between OpenAI and Google Gemini.

## 2. Core Architecture Upgrades

### 2.1 Multi-LLM Provider Abstraction
**Objective**: Decouple application logic from specific AI providers.

*   **Design Pattern**: Strategy Pattern with a Factory.
*   **Components**:
    *   `LLMProvider` Interface: Defines standard methods (`chat`, `embed`, `stream`).
    *   `OpenAIProvider`: Implementation using `openai` SDK.
    *   `GeminiProvider`: Implementation using `@google/generative-ai` SDK.
    *   `ProviderFactory`: Instantiates the correct provider based on configuration (Env vars or Database config).
*   **Configuration**:
    *   `AI_PROVIDER`: `openai` | `gemini`
    *   `AI_MODEL_CHAT`: `gpt-4o` | `gemini-1.5-pro`
    *   `AI_MODEL_EMBEDDING`: `text-embedding-3-small` | `text-embedding-004`

### 2.2 Document Ingestion Pipeline
**Objective**: Robust, scalable document processing.

*   **Pipeline Stages**:
    1.  **Upload**: Secure S3/Blob Storage upload with presigned URLs.
    2.  **Validation**: File type check, virus scan (ClamAV), size limits.
    3.  **Parsing**:
        *   **PDF**: `pdf-parse` (current) -> Upgrade to `pdf.js` or OCR (Tesseract) for scanned docs.
        *   **Office**: `mammoth` (DOCX), `xlsx` (Excel).
    4.  **Chunking**:
        *   Implement **Recursive Character Splitting** (overlap: 10-20%) to preserve context.
        *   **Metadata Extraction**: Extract Title, Author, Date, Summary (using LLM).
    5.  **Vectorization**: Batch processing for embeddings to respect rate limits.
    6.  **Storage**: Qdrant (Managed Cloud or Cluster).

### 2.3 Hybrid Search RAG
**Objective**: Improve retrieval accuracy.

*   **Mechanism**:
    *   **Semantic Search**: Dense vector retrieval (Qdrant).
    *   **Keyword Search**: BM25 (Sparse vector retrieval in Qdrant or separate search index like Meilisearch).
    *   **Re-ranking**: Cross-encoder model (e.g., Cohere Rerank or local ONNX model) to score top-K results.
*   **Caching**: Redis cache for frequent queries (Key: Hash(Query + DocID), Value: Context).

### 2.4 Real-time Voice Infrastructure
**Objective**: Low-latency, natural voice interaction.

*   **Architecture**:
    *   **Frontend**: Abstract `useVoiceClient` hook.
    *   **Backend**:
        *   **OpenAI**: WebRTC (Ephemeral Token).
        *   **Gemini**: WebSocket (Multimodal Live API).
    *   **Audio Handling**:
        *   **Input**: AudioWorklet for non-blocking capture.
        *   **Output**: AudioBufferSourceNode for smooth playback.
        *   **VAD (Voice Activity Detection)**: Client-side (Silero VAD) to reduce unnecessary streaming.

## 3. Production Migration Plan

### Phase 1: Foundation & Abstraction (Weeks 1-2)
1.  **Refactor**: Create `src/modules/ai-core` directory.
2.  **Implement**: `LLMProvider` interface and `OpenAIProvider`.
3.  **Verify**: Ensure existing functionality works 100% with the new abstraction.
4.  **Test**: Unit tests for the provider layer.

### Phase 2: Gemini Integration (Weeks 3-4)
1.  **Implement**: `GeminiProvider`.
2.  **Embeddings**:
    *   **Challenge**: Dimension mismatch (1536 vs 768).
    *   **Solution**: Create new Qdrant collections for Gemini. Implement a "Re-ingest" script to regenerate embeddings for all existing docs.
3.  **Voice**: Build `GeminiVoiceClient` (WebSocket implementation).

### Phase 3: Infrastructure Hardening (Weeks 5-6)
1.  **Database**: Migrate local Qdrant to Qdrant Cloud or a persistent Docker volume with backups.
2.  **Storage**: Move from local file uploads to S3/R2.
3.  **Monitoring**:
    *   **Logs**: Winston/Pino -> CloudWatch/Datadog.
    *   **Metrics**: Prometheus (Request latency, Token usage, Error rates).
    *   **Tracing**: OpenTelemetry.

### Phase 4: Deployment & Cutover (Week 7)
1.  **CI/CD**: GitHub Actions pipeline (Lint -> Test -> Build -> Docker Push).
2.  **Environment**: Blue/Green deployment on Vercel or Kubernetes.
3.  **Cutover**:
    *   Deploy "Green" env with new architecture.
    *   Run integration tests.
    *   Switch DNS/Traffic.

## 4. Risk Management

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Embedding Incompatibility** | High (RAG breaks) | Dual-write embeddings during migration. Version collections (`v1_openai`, `v2_gemini`). |
| **Voice Latency** | Medium (UX degradation) | Edge deployment for API routes. Optimize audio chunk sizes. |
| **Provider Rate Limits** | Medium (Service outage) | Implement exponential backoff. Circuit breaker pattern. |
| **Cost Spikes** | Low (Budget overrun) | Token usage quotas per tenant. Budget alerts. |

## 5. Security & Compliance
*   **Data**: Encryption at rest (AES-256) and in transit (TLS 1.3).
*   **API Keys**: Store in Secret Manager (AWS Secrets Manager / Vercel Env Vars), never in code.
*   **Audit**: Log all "Write" actions (Upload, Delete, Config Change) with User ID and Timestamp.

## 6. Testing Strategy
*   **Unit**: Jest/Vitest for logic (Chunking, Parsers).
*   **Integration**: Test API endpoints with mocked LLM responses.
*   **E2E**: Playwright tests for Chat and Upload flows.
*   **Load**: k6 script to simulate 50 concurrent users chatting.
