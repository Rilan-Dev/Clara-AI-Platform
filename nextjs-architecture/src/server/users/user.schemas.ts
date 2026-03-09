import { z } from "zod";
import {
  USER_ROLE_VALUES,
  USER_STATUS_VALUES,
} from "@/features/users/types/user.types";

export const listUsersParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(12).default(6),
  search: z.string().trim().optional().default(""),
});

export const createUserPayloadSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  role: z.enum(USER_ROLE_VALUES),
  team: z.string().trim().min(2).max(40),
  jobTitle: z.string().trim().min(2).max(60),
  password: z.string().min(8),
});

export const updateUserPayloadSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  role: z.enum(USER_ROLE_VALUES).optional(),
  status: z.enum(USER_STATUS_VALUES).optional(),
  team: z.string().trim().min(2).max(40).optional(),
  jobTitle: z.string().trim().min(2).max(60).optional(),
});
