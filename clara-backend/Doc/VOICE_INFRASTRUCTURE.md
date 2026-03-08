# Real-time Voice Infrastructure Architecture

## 1. Overview
This document details the architecture for a robust, low-latency Real-time Voice Infrastructure that supports both OpenAI (WebRTC) and Gemini (WebSocket) protocols, ensuring a seamless user experience regardless of the underlying AI provider.

## 2. Core Architecture

### 2.1 Client-Side Abstraction (Frontend)
*   **`useVoiceClient` Hook**: A unified React hook that abstracts the underlying connection protocol.
    *   **State**: `isConnected`, `isSpeaking`, `isListening`, `error`.
    *   **Methods**: `connect()`, `disconnect()`, `interrupt()`, `sendText()`.
    *   **Events**: `onTranscript`, `onAudioDelta`, `onToolCall`.

### 2.2 Protocol Adapters
*   **`OpenAIAdapter`**:
    *   **Protocol**: WebRTC (Ephemeral Token).
    *   **Audio**: Browser-native `RTCPeerConnection`.
    *   **VAD**: Server-side (OpenAI VAD).
*   **`GeminiAdapter`**:
    *   **Protocol**: WebSocket (Multimodal Live API).
    *   **Audio**:
        *   **Input**: `AudioWorklet` captures PCM 16kHz mono.
        *   **Output**: `AudioBufferSourceNode` queues and plays PCM chunks.
    *   **VAD**: Client-side (Silero VAD or simple energy threshold) to avoid sending silence.

### 2.3 Audio Processing Pipeline
*   **Input (Microphone)**:
    *   **Noise Suppression**: `MediaTrackConstraints` (`echoCancellation: true`, `noiseSuppression: true`).
    *   **Resampling**: Convert browser sample rate (e.g., 44.1kHz/48kHz) to model requirement (16kHz/24kHz).
*   **Output (Speaker)**:
    *   **Jitter Buffer**: Small buffer (e.g., 200ms) to smooth out network variations.
    *   **Gain Control**: Normalize volume.

### 2.4 Backend Infrastructure
*   **Session Management**:
    *   **Endpoint**: `/api/voice/session`.
    *   **Logic**:
        *   Authenticate user.
        *   Select provider based on config/plan.
        *   **OpenAI**: Call `https://api.openai.com/v1/realtime/sessions` -> Return ephemeral token.
        *   **Gemini**: Return API key (proxied) or signed JWT for WebSocket connection.

## 3. Implementation Plan

### Phase 1: Client Abstraction
1.  **Interface**: Define `VoiceClient` interface.
2.  **Refactor**: Move existing OpenAI logic into `OpenAIAdapter`.
3.  **Hook**: Create `useVoiceClient` that instantiates the correct adapter.

### Phase 2: Gemini WebSocket Adapter
1.  **WebSocket**: Implement `GeminiAdapter` using `WebSocket` API.
2.  **Audio**:
    *   Implement `AudioRecorder` (Worklet) for input.
    *   Implement `AudioPlayer` (Worklet/ScriptProcessor) for output.
3.  **Protocol**: Handle Gemini's JSON message format (Handshake, Content, End).

### Phase 3: Optimization & Fallback
1.  **VAD**: Integrate a lightweight VAD library (e.g., `@ricky0123/vad-web`) to reduce bandwidth.
2.  **Fallback**: If connection fails, auto-retry with exponential backoff or switch provider (if configured).
