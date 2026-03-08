# OpenAI Integration Analysis & Gemini Migration Plan

## 1. Code Discovery Phase

### Dependencies
- **Package**: `openai` (v6.5.0)fyui;/
- **File**: `package.json`  

### Source Code References
| File Path | Component | Usage |
|-----------|-----------|-------|
| `src/modules/shared/openai.ts` | Client Factory | Initializes `OpenAI` client with API key. |
| `src/modules/assistant/api/llm.ts` | Service | `getChatCompletion` wrapper for simple text generation. |
| `src/modules/admin/core/vector-store.ts` | Service | `embedText` and `embedQuery` for generating embeddings. |
| `src/modules/assistant/api/chat.ts` | API Route | Streaming chat response using `chat.completions.create`. |
| `src/modules/assistant/api/realtime.ts` | API Route | Creates ephemeral sessions for Realtime API. |
| `src/modules/assistant/core/hooks/useOpenAIRealtime.ts` | Hook | Frontend WebRTC connection to OpenAI Realtime API. |
| `src/modules/assistant/api/rag.ts` | API Route | Uses `embedQuery` (via `vector-store.ts`) for RAG search. |
| `scripts/ingest.ts` | Script | Uses `upsertDocuments` (via `vector-store.ts`) for ingestion. |
| `scripts/ingest-web.ts` | Script | Uses `upsertDocuments` (via `vector-store.ts`) for ingestion. |

### Configuration
- **Environment Variables**:
  - `OPENAI_API_KEY`
  - `OPENAI_CHAT_MODEL` (Default: `gpt-4o-mini`)
  - `OPENAI_EMBEDDING_MODEL` (Default: `text-embedding-3-small`)
  - `OPENAI_EMBEDDING_DIMENSION` (Default: 1536 or 3072)
  - `OPENAI_REALTIME_MODEL` (Default: `gpt-4o-realtime-preview`)
  - `OPENAI_REALTIME_VOICE` (Default: `alloy`)
  - `NEXT_PUBLIC_OPENAI_REALTIME_MODEL`

## 2. Architecture Mapping

### API Endpoints & Services
1.  **Chat API (`/api/chat`)**:
    -   **Flow**: Request -> Validate -> Retrieve Context (Qdrant) -> OpenAI Chat Completion (Stream) -> Response.
    -   **Integration**: Direct call to `client.chat.completions.create`.
2.  **RAG Search (`/api/rag/search`)**:
    -   **Flow**: Request -> Embed Query (OpenAI) -> Search Qdrant -> Return Results.
    -   **Integration**: Indirect via `embedQuery`.
3.  **Realtime Session (`/api/realtime/session`)**:
    -   **Flow**: Request -> OpenAI API (Create Session) -> Return Ephemeral Token.
    -   **Integration**: Direct fetch to `https://api.openai.com/v1/realtime/sessions`.
4.  **Realtime Client (Frontend)**:
    -   **Flow**: `useOpenAIRealtime` -> WebRTC -> OpenAI Realtime API.
    -   **Integration**: Manages WebRTC connection, audio streaming, and data channel events.

### Data Flow
-   **Embeddings**: Text -> OpenAI Embedding API -> Vector (Float Array) -> Qdrant.
-   **Chat**: Messages + Context -> OpenAI Chat API -> Text Stream.
-   **Voice**: Audio Stream -> OpenAI Realtime API -> Audio Stream + Text/Events.

## 3. Integration Points Documentation

| Service | Model (Default) | Purpose | I/O Format |
|---------|-----------------|---------|------------|
| **Chat Completion** | `gpt-4o-mini` | Text generation for chat interface. | Input: `ChatMessage[]`<br>Output: Stream or String |
| **Embeddings** | `text-embedding-3-small` | Vector generation for RAG. | Input: String<br>Output: `number[]` (1536 dims) |
| **Realtime API** | `gpt-4o-realtime-preview` | Voice-to-voice interaction. | Input: Audio/WebRTC<br>Output: Audio/WebRTC |

## 4. Migration Planning: OpenAI to Gemini AI

### Technical Requirements
-   **SDK**: Replace `openai` with `@google/generative-ai`.
-   **API Key**: `GEMINI_API_KEY`.
-   **Models**:
    -   Chat: `gemini-1.5-flash` (fast/cheap) or `gemini-1.5-pro` (reasoning).
    -   Embeddings: `text-embedding-004`.
    -   Realtime: Gemini Multimodal Live API (via WebSocket).

### Compatibility Mapping

| Feature | OpenAI Implementation | Gemini Equivalent | Notes |
|---------|-----------------------|-------------------|-------|
| **Client** | `new OpenAI({ apiKey })` | `new GoogleGenerativeAI(apiKey)` | Different instantiation. |
| **Chat** | `chat.completions.create` | `model.generateContentStream` | Message format differs (Roles: user/model vs user/assistant). |
| **Embeddings** | `embeddings.create` | `model.embedContent` | Response structure differs. |
| **Realtime** | WebRTC (Proprietary) | WebSocket (Multimodal Live) | **Major Change**: Gemini uses WebSockets for Live API, not WebRTC directly. The frontend hook will need a complete rewrite. |

### Migration Strategy

#### Phase 1: Backend Services (Low Risk)
1.  **Install SDK**: `npm install @google/generative-ai`.
2.  **Shared Module**: Create `src/modules/shared/gemini.ts`.
3.  **Embeddings**: Update `src/modules/admin/core/vector-store.ts` to use Gemini embeddings.
    *   *Risk*: Dimension mismatch. `text-embedding-004` is 768 dimensions. `text-embedding-3-small` is 1536. **Action**: Re-ingest all documents or use a projection layer (Re-ingestion recommended).
4.  **LLM Service**: Update `src/modules/assistant/api/llm.ts` to use Gemini.

#### Phase 2: Chat API (Medium Risk)
1.  **Streaming**: Update `src/modules/assistant/api/chat.ts`.
    *   Adapt message history format (OpenAI `messages` -> Gemini `contents`).
    *   Update streaming response handling (`NextResponse` stream adaptation).

#### Phase 3: Realtime Voice (High Risk)
1.  **Frontend Hook**: Rewrite `useOpenAIRealtime.ts` to `useGeminiLive.ts`.
    *   Switch from WebRTC to WebSocket implementation.
    *   Handle audio recording/playback manually (AudioContext) or use a helper library, as Gemini Live sends raw PCM audio over WebSocket.
2.  **Session Endpoint**: Update `/api/realtime/session` (if needed for token generation, though Gemini often uses API key directly or OAuth).

### Inventory of Files to Modify
1.  `package.json`
2.  `src/modules/shared/openai.ts` -> `src/modules/shared/gemini.ts`
3.  `src/modules/assistant/api/llm.ts`
4.  `src/modules/admin/core/vector-store.ts`
5.  `src/modules/assistant/api/chat.ts`
6.  `src/modules/assistant/api/realtime.ts`
7.  `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`
8.  `src/modules/assistant/core/config.ts` (Update model constants)
9.  `.env` (Add Gemini keys, remove OpenAI keys)

### Risk Assessment
-   **Embedding Incompatibility**: Switching embedding models invalidates existing vector stores. **Mitigation**: Plan for a full data re-ingestion.
-   **Realtime Protocol**: Moving from WebRTC (OpenAI) to WebSocket (Gemini) is a significant architectural change for the voice feature. **Mitigation**: Prototype the WebSocket audio handling separately first.
