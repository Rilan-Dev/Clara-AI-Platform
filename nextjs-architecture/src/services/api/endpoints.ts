const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_BASE_URL ?? "/api";

function withBase(path: string) {
  return `${API_BASE_URL}${path}`;
}

function queryString(params?: Record<string, string | number | undefined>) {
  if (!params) {
    return "";
  }

  const values = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");

  if (!values.length) {
    return "";
  }

  return `?${new URLSearchParams(values.map(([key, value]) => [key, String(value)])).toString()}`;
}

export const ENDPOINTS = {
  users: {
    list: (params?: { page?: number; limit?: number; search?: string }) =>
      `${withBase("/users")}${queryString(params)}`,
    detail: (id: string) => withBase(`/users/${id}`),
    create: withBase("/users"),
    update: (id: string) => withBase(`/users/${id}`),
    remove: (id: string) => withBase(`/users/${id}`),
  },
} as const;
