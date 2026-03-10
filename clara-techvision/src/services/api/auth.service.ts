import { ENDPOINTS } from "@/services/api/endpoints";
import http from "@/services/api/http.client";
import type { LoginPayload, LoginResponse } from "@/services/api/portal.types";

export const authService = {
  async login(payload: LoginPayload) {
    const { data } = await http.post<LoginResponse>(ENDPOINTS.auth.login, payload);
    return data;
  },

  async logout() {
    await http.post(ENDPOINTS.auth.logout);
  },
};
