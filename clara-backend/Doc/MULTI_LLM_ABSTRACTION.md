# Multi-LLM Provider Abstraction Layer

## 1. Overview
This document defines the architecture for the Multi-LLM Provider Abstraction Layer, enabling the application to switch seamlessly between OpenAI and Google Gemini (and potentially others) without changing core business logic.

## 2. Core Interfaces

### 2.1 `LLMProvider` Interface
The central contract that all providers must implement.

```typescript
export interface LLMProvider {
  // Chat Completion (Streaming)
  chatStream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<string, void, unknown>;

  // Embeddings
  embedText(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;

  // Configuration
  getProviderName(): string;
  getModelName(type: 'chat' | 'embedding'): string;
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatOptions = {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
};
```

### 2.2 `ProviderFactory`
A factory class responsible for instantiating the correct provider based on configuration.

```typescript
export class ProviderFactory {
  static getProvider(config: ProviderConfig): LLMProvider {
    switch (config.provider) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'gemini':
        return new GeminiProvider(config);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }
}
```

## 3. Provider Implementations

### 3.1 `OpenAIProvider`
*   **SDK**: `openai`
*   **Chat**: Maps `ChatMessage` to `ChatCompletionMessageParam`. Uses `client.chat.completions.create({ stream: true })`.
*   **Embeddings**: Uses `client.embeddings.create`.

### 3.2 `GeminiProvider`
*   **SDK**: `@google/generative-ai`
*   **Chat**:
    *   Maps `system` role to `systemInstruction`.
    *   Maps `user`/`assistant` to `Content` objects (`role: 'user' | 'model'`).
    *   Uses `model.generateContentStream`.
*   **Embeddings**: Uses `model.embedContent` (single) or `batchEmbedContents` (batch).

## 4. Configuration Management
*   **Environment Variables**:
    *   `AI_PROVIDER`: `openai` (default)
    *   `OPENAI_API_KEY`
    *   `GEMINI_API_KEY`
    *   `AI_MODEL_CHAT`: Override default model name.
    *   `AI_MODEL_EMBEDDING`: Override default embedding model.

## 5. Implementation Plan

### Phase 1: Interface Definition
1.  Create `src/modules/ai-core/types.ts` defining the interfaces.
2.  Create `src/modules/ai-core/factory.ts`.

### Phase 2: OpenAI Migration
1.  Create `src/modules/ai-core/providers/openai.ts`.
2.  Move logic from `src/modules/shared/openai.ts` and `src/modules/assistant/api/llm.ts` into this provider.
3.  Update `src/modules/assistant/api/chat.ts` to use `ProviderFactory.getProvider().chatStream()`.

### Phase 3: Gemini Implementation
1.  Create `src/modules/ai-core/providers/gemini.ts`.
2.  Implement mapping logic for chat history and embeddings.
3.  Add integration tests to verify parity with OpenAI.
