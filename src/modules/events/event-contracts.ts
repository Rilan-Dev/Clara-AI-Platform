export type ClaraEventEnvelope<TPayload = unknown> = {
  id: string;
  type: string;
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
};

export type PhoneCallCompletedPayload = {
  targetUrl: string;
  callSid: string;
  kbId: string | null;
  status: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  turnCount: number | null;
  transcript: unknown | null;
  recordingUrl: string | null;
  errorMessage: string | null;
};

export type PhoneCallCompletedEvent = ClaraEventEnvelope<PhoneCallCompletedPayload> & {
  type: "webhook.phone.call.completed";
  aggregateType: "phone_call";
};
