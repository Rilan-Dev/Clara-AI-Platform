"use client";

import Link from "next/link";
import { ArrowLeft, BadgeCheck, CalendarClock, Mail, Users2 } from "lucide-react";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Spinner } from "@/components/ui/Spinner";
import { useUser } from "@/features/users/hooks/useUsers";
import { formatDate, formatRelativeTime, sentenceCase } from "@/utils/format";

export function UserDetailsScreen({ userId }: { userId: string }) {
  const userQuery = useUser(userId);

  if (userQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (userQuery.isError || !userQuery.data) {
    return (
      <div className="space-y-4">
        <Link href="/users" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950">
          <ArrowLeft className="size-4" />
          Back to directory
        </Link>
        <InlineAlert tone="error" title="User not available" description={userQuery.error?.message ?? "We could not find that profile."} />
      </div>
    );
  }

  const user = userQuery.data;

  const detailCards = [
    { label: "Role", value: sentenceCase(user.role), icon: BadgeCheck },
    { label: "Team", value: user.team, icon: Users2 },
    { label: "Joined", value: formatDate(user.createdAt), icon: CalendarClock },
    { label: "Last active", value: formatRelativeTime(user.lastActiveAt), icon: Mail },
  ];

  return (
    <div className="space-y-6">
      <Link href="/users" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950">
        <ArrowLeft className="size-4" />
        Back to directory
      </Link>

      <section className="rounded-[36px] border border-white/70 bg-white/90 p-6 shadow-soft sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-5">
            <div className="flex size-20 items-center justify-center rounded-[28px] bg-slate-950 text-2xl font-bold text-white">
              {user.fullName
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">User profile</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{user.fullName}</h1>
              <p className="mt-2 text-base text-slate-600">{user.jobTitle}</p>
              <p className="mt-3 text-sm text-slate-500">{user.email}</p>
            </div>
          </div>

          <div className="rounded-[28px] bg-slate-950 px-5 py-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Status</p>
            <p className="mt-2 text-2xl font-semibold">{sentenceCase(user.status)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {detailCards.map((card) => (
          <article key={card.label} className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{card.label}</p>
              <card.icon className="size-4 text-sky-600" />
            </div>
            <p className="mt-4 text-xl font-semibold text-slate-950">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-soft">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Architecture notes</p>
          <div className="mt-4 space-y-4 text-slate-600">
            <p>
              This screen only consumes the `useUser` hook. The page never imports an endpoint or service directly, which keeps data-access concerns isolated.
            </p>
            <p>
              If you wire this scaffold to a persistent backend, swap the repository implementation and keep the route contracts the same.
            </p>
          </div>
        </article>

        <article className="rounded-[32px] border border-white/70 bg-slate-950 p-6 text-white shadow-soft">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/60">Snapshot</p>
          <dl className="mt-5 space-y-4 text-sm text-white/80">
            <div>
              <dt className="text-white/50">Role</dt>
              <dd className="mt-1 text-lg font-semibold text-white">{sentenceCase(user.role)}</dd>
            </div>
            <div>
              <dt className="text-white/50">Updated</dt>
              <dd className="mt-1 text-lg font-semibold text-white">{formatDate(user.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-white/50">Directory id</dt>
              <dd className="mt-1 font-mono text-sm text-sky-200">{user.id}</dd>
            </div>
          </dl>
        </article>
      </section>
    </div>
  );
}
