import { randomUUID } from "node:crypto";
import type {
  CreateUserPayload,
  UpdateUserPayload,
  User,
  UserListParams,
} from "@/features/users/types/user.types";
import type { PaginatedResponse } from "@/types/api.types";

const seededUsers: User[] = [
  ["Ava Hamilton", "ava@northstar.io", "admin", "Operations", "Head of Delivery", "active", "2026-03-08T14:10:00.000Z"],
  ["Rami Patel", "rami@northstar.io", "editor", "Growth", "Lifecycle Strategist", "active", "2026-03-08T11:45:00.000Z"],
  ["Joanna Reeves", "joanna@northstar.io", "viewer", "Support", "Quality Lead", "inactive", "2026-03-05T09:20:00.000Z"],
  ["Nico Alvarez", "nico@northstar.io", "editor", "Product", "Product Ops Partner", "active", "2026-03-09T08:18:00.000Z"],
  ["Maya Chen", "maya@northstar.io", "viewer", "People", "Talent Partner", "invited", "2026-03-07T16:03:00.000Z"],
  ["Theo Brooks", "theo@northstar.io", "admin", "Finance", "RevOps Director", "active", "2026-03-09T06:54:00.000Z"],
  ["Kira Mendez", "kira@northstar.io", "editor", "Marketing", "Brand Systems Manager", "suspended", "2026-02-28T12:37:00.000Z"],
  ["Lena Fischer", "lena@northstar.io", "viewer", "Success", "Implementation Specialist", "active", "2026-03-09T10:02:00.000Z"],
].map(([fullName, email, role, team, jobTitle, status, lastActiveAt], index) => ({
  id: `usr_${index + 1}`,
  fullName,
  email,
  role: role as User["role"],
  status: status as User["status"],
  team,
  jobTitle,
  avatarUrl: null,
  lastActiveAt,
  createdAt: `2026-02-${String(index + 10).padStart(2, "0")}T09:00:00.000Z`,
  updatedAt: `2026-03-${String((index % 9) + 1).padStart(2, "0")}T09:30:00.000Z`,
}));

const users = new Map(seededUsers.map((user) => [user.id, user]));

function normalizeSearch(search = "") {
  return search.trim().toLowerCase();
}

export const userRepository = {
  list(params: UserListParams): PaginatedResponse<User> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 6;
    const search = normalizeSearch(params.search);

    const filteredUsers = [...users.values()].filter((user) => {
      if (!search) {
        return true;
      }

      return [user.fullName, user.email, user.team, user.jobTitle].some((value) =>
        value.toLowerCase().includes(search),
      );
    });

    const total = filteredUsers.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;

    return {
      items: filteredUsers.slice(start, start + limit),
      meta: { page, limit, total, totalPages },
    };
  },

  findById(id: string) {
    return users.get(id) ?? null;
  },

  create(payload: CreateUserPayload) {
    const now = new Date().toISOString();
    const nextUser: User = {
      id: `usr_${randomUUID().slice(0, 8)}`,
      fullName: payload.fullName,
      email: payload.email.toLowerCase(),
      role: payload.role,
      status: "invited",
      team: payload.team,
      jobTitle: payload.jobTitle,
      avatarUrl: null,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    };

    users.set(nextUser.id, nextUser);
    return nextUser;
  },

  update(id: string, payload: UpdateUserPayload) {
    const currentUser = users.get(id);

    if (!currentUser) {
      return null;
    }

    const updatedUser: User = {
      ...currentUser,
      ...payload,
      updatedAt: new Date().toISOString(),
    };

    users.set(id, updatedUser);
    return updatedUser;
  },

  remove(id: string) {
    return users.delete(id);
  },
};
