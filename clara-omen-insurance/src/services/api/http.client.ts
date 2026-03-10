import { ApiError, createHttpClient, isApiError } from "@clara/api-client";

const http = createHttpClient({
  requestIdPrefix: "omen",
  backendUnavailableMessage: "Cannot reach the Clara backend. Ensure it is running on port 3000.",
  onUnauthorized: () => {
    window.location.href = "/login";
  },
});

export { ApiError, isApiError };
export default http;
