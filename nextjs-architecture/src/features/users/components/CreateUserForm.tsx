"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Input } from "@/components/ui/Input";
import { useUIStore } from "@/store";
import { cn } from "@/utils/cn";
import {
  USER_ROLE_VALUES,
  type CreateUserFormValues,
} from "@/features/users/types/user.types";
import { useCreateUser } from "@/features/users/hooks/useUsers";

const createUserSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter a full name"),
    email: z.string().trim().email("Enter a valid work email"),
    role: z.enum(USER_ROLE_VALUES),
    team: z.string().trim().min(2, "Team is required"),
    jobTitle: z.string().trim().min(2, "Job title is required"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Add one uppercase letter")
      .regex(/[0-9]/, "Add one number"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const selectClassName =
  "h-12 rounded-2xl border border-slate-200 bg-white px-4 text-slate-950 outline-none transition focus:border-slate-900";

export function CreateUserForm({ onSuccess }: { onSuccess?: () => void }) {
  const addToast = useUIStore((state) => state.addToast);
  const createUserMutation = useCreateUser();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    mode: "onTouched",
    defaultValues: {
      role: "viewer",
      fullName: "",
      email: "",
      team: "",
      jobTitle: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: CreateUserFormValues) {
    const { confirmPassword: _confirmPassword, ...payload } = values;

    try {
      await createUserMutation.mutateAsync(payload);
      addToast({
        tone: "success",
        title: "User invited",
        description: `${values.fullName} is now part of the workspace roster.`,
      });
      reset();
      onSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the user";
      addToast({ tone: "error", title: "Creation failed", description: message });
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Full name" placeholder="Jordan Reed" error={errors.fullName?.message} {...register("fullName")} />
        <Input label="Work email" placeholder="jordan@northstar.io" error={errors.email?.message} {...register("email")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-700">
          <span className="font-medium text-slate-900">Role</span>
          <select className={cn(selectClassName, errors.role ? "border-rose-300 focus:border-rose-500" : null)} {...register("role")}>
            {USER_ROLE_VALUES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <Input label="Team" placeholder="Operations" error={errors.team?.message} {...register("team")} />
      </div>

      <Input label="Job title" placeholder="Program Manager" error={errors.jobTitle?.message} {...register("jobTitle")} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Temporary password"
          type="password"
          hint="At least 8 chars, one uppercase, one number"
          error={errors.password?.message}
          {...register("password")}
        />
        <Input label="Confirm password" type="password" error={errors.confirmPassword?.message} {...register("confirmPassword")} />
      </div>

      {createUserMutation.isError ? (
        <InlineAlert tone="error" title="Unable to create user" description={createUserMutation.error.message} />
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-sm text-slate-500">Form state lives in React Hook Form. Server state lives in React Query.</p>
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => reset()} disabled={!isDirty || createUserMutation.isPending}>
            Reset
          </Button>
          <Button type="submit" loading={createUserMutation.isPending}>
            Invite user
          </Button>
        </div>
      </div>
    </form>
  );
}
