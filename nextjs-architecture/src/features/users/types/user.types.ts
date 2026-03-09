export const USER_ROLE_VALUES = ["admin", "editor", "viewer"] as const;
export const USER_STATUS_VALUES = ["active", "inactive", "invited", "suspended"] as const;

export type UserRole = (typeof USER_ROLE_VALUES)[number];
export type UserStatus = (typeof USER_STATUS_VALUES)[number];

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  team: string;
  jobTitle: string;
  avatarUrl: string | null;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface CreateUserPayload {
  fullName: string;
  email: string;
  role: UserRole;
  team: string;
  jobTitle: string;
  password: string;
}

export interface UpdateUserPayload {
  fullName?: string;
  role?: UserRole;
  status?: UserStatus;
  team?: string;
  jobTitle?: string;
}

export interface CreateUserFormValues extends CreateUserPayload {
  confirmPassword: string;
}
