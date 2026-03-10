import { createTokenStorage } from "@clara/consumer-runtime/auth";

const tokenStorage = createTokenStorage("clara-omen-token");

export const getStoredToken = tokenStorage.getStoredToken;
export const setStoredToken = tokenStorage.setStoredToken;
export const clearStoredToken = tokenStorage.clearStoredToken;
export const withAuthHeaders = tokenStorage.withAuthHeaders;
