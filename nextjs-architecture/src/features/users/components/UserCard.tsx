import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import type { User } from "@/features/users/types/user.types";
import { cn } from "@/utils/cn";
import { formatRelativeTime, sentenceCase } from "@/utils/format";

const roleStyles: Record<User["role"], string> = {
  admin: "bg-slate-950 text-white",
  editor: "bg-sky-100 text-sky-800",
  viewer: "bg-slate-100 text-slate-700",
};

const statusStyles: Record<User["status"], string> = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-700",
  invited: "bg-amber-100 text-amber-700",
  suspended: "bg-rose-100 text-rose-700",
};

export function UserCard({
  user,
  onDelete,
}: {
  user: User;
  onDelete: (user: User) => void;
}) {
  return (
    <article className="group rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-soft transition hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-lg font-bold text-white">
            {user.fullName
              .split(" ")
              .slice(0, 2)
              .map((part) => part[0])
              .join("")}
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-950">{user.fullName}</p>
            <p className="mt-1 text-sm text-slate-500">{user.jobTitle}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
              <span className={cn("rounded-full px-3 py-1", roleStyles[user.role])}>{user.role}</span>
              <span className={cn("rounded-full px-3 py-1", statusStyles[user.status])}>
                {sentenceCase(user.status)}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDelete(user)}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
        >
          Remove
        </button>
      </div>

      <div className="mt-5 grid gap-3 rounded-[24px] bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Email</p>
          <p className="mt-1 font-medium text-slate-950">{user.email}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Team</p>
          <p className="mt-1 font-medium text-slate-950">{user.team}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Clock3 className="size-4" />
          Active {formatRelativeTime(user.lastActiveAt)}
        </div>

        <Link
          href={`/users/${user.id}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950 transition group-hover:text-sky-700"
        >
          View profile
          <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </article>
  );
}
