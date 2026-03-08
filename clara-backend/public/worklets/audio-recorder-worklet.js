class AudioRecorderWorklet extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      // Convert Float32 (from mic) to Int16 (for Gemini Multimodal Live API)
      const int16Array = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        // Clamp the values to -1.0 to 1.0 to prevent overflow
        const s = Math.max(-1, Math.min(1, channelData[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      // Send the Int16Array back to the main thread
      this.port.postMessage(int16Array);
    }
    // Return true to keep the processor alive
    return true;
  }
}

registerProcessor('audio-recorder-worklet', AudioRecorderWorklet);
