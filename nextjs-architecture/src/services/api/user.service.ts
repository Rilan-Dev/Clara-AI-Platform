import { ENDPOINTS } from "@/services/api/endpoints";
import http from "@/services/api/http.client";
import type { ApiResponse, PaginatedResponse } from "@/types/api.types";
import type {
  CreateUserPayload,
  UpdateUserPayload,
  User,
  UserListParams,
} from "@/features/users/types/user.types";

export const userService = {
  async list(params: UserListParams = {}) {
    const { data } = await http.get<ApiResponse<PaginatedResponse<User>>>(ENDPOINTS.users.list(params));
    return data.data;
  },

  async getById(id: string) {
    const { data } = await http.get<ApiResponse<User>>(ENDPOINTS.users.detail(id));
    return data.data;
  },

  async create(payload: CreateUserPayload) {
    const { data } = await http.post<ApiResponse<User>>(ENDPOINTS.users.create, payload);
    return data.data;
  },

  async update(id: string, payload: UpdateUserPayload) {
    const { data } = await http.patch<ApiResponse<User>>(ENDPOINTS.users.update(id), payload);
    return data.data;
  },

  async remove(id: string) {
    await http.delete(ENDPOINTS.users.remove(id));
  },
};
