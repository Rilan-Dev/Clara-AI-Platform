"use client";

import { useMemo, useState } from "react";
import { Search, ShieldCheck, Sparkles, Users2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { useDebounce } from "@/hooks/useDebounce";
import { useUIStore } from "@/store";
import { UserCard } from "@/features/users/components/UserCard";
import { CreateUserForm } from "@/features/users/components/CreateUserForm";
import { useDeleteUser, useUsers } from "@/features/users/hooks/useUsers";
import type { User } from "@/features/users/types/user.types";

export function UsersScreen() {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText, 350);

  const userComposerOpen = useUIStore((state) => state.userComposerOpen);
  const openUserComposer = useUIStore((state) => state.openUserComposer);
  const closeUserComposer = useUIStore((state) => state.closeUserComposer);
  const addToast = useUIStore((state) => state.addToast);

  const usersQuery = useUsers({ page, limit: 6, search: debouncedSearch });
  const deleteUserMutation = useDeleteUser();

  const statCards = useMemo(() => {
    const items = usersQuery.data?.items ?? [];

    return [
      {
        label: "Visible users",
        value: usersQuery.data?.meta.total ?? 0,
        icon: Users2,
      },
      {
        label: "Admins in current slice",
        value: items.filter((user) => user.role === "admin").length,
        icon: ShieldCheck,
      },
      {
        label: "Recently active",
        value: items.filter((user) => user.status === "active").length,
        icon: Sparkles,
      },
    ];
  }, [usersQuery.data]);

  async function handleDelete(user: User) {
    if (!window.confirm(`Remove ${user.fullName} from the workspace roster?`)) {
      return;
    }

    try {
      await deleteUserMutation.mutateAsync(user.id);
      addToast({ tone: "info", title: "User removed", description: `${user.fullName} has been removed.` });
    } catch (error) {
      addToast({
        tone: "error",
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Could not remove the user",
      });
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[36px] border border-white/70 bg-white/80 p-6 shadow-soft sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
              Feature module example
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                A complete App Router feature wired with Zustand, React Query, and React Hook Form.
              </h1>
              <p className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
                Search, paginate, create, and inspect users without leaking endpoint strings into UI code.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => usersQuery.refetch()}>
              Refresh cache
            </Button>
            <Button onClick={openUserComposer}>Open composer</Button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {statCards.map((card) => (
            <div key={card.label} className="rounded-[28px] bg-slate-950 px-5 py-5 text-white">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white/70">{card.label}</p>
                <card.icon className="size-5 text-sky-300" />
              </div>
              <p className="mt-6 text-4xl font-semibold tracking-tight">{card.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <div className="rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-soft">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-md">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Server state workspace</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Team directory</h2>
              </div>

              <div className="w-full max-w-sm">
                <Input
                  aria-label="Search users"
                  placeholder="Search by name, role, team"
                  value={searchText}
                  onChange={(event) => {
                    setSearchText(event.target.value);
                    setPage(1);
                  }}
                  className="pl-11"
                />
                <Search className="pointer-events-none relative -mt-9 ml-4 size-4 text-slate-400" />
              </div>
            </div>
          </div>

          {usersQuery.isLoading ? (
            <div className="flex min-h-72 items-center justify-center rounded-[30px] border border-dashed border-slate-200 bg-white/80">
              <Spinner className="size-8" />
            </div>
          ) : null}

          {usersQuery.isError ? (
            <InlineAlert
              tone="error"
              title="Unable to load users"
              description={usersQuery.error.message}
            />
          ) : null}

          {usersQuery.data && usersQuery.data.items.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-slate-200 bg-white/80 px-6 py-16 text-center shadow-soft">
              <p className="text-xl font-semibold text-slate-950">No matching users</p>
              <p className="mt-2 text-slate-500">Try a broader search or add someone new to the roster.</p>
            </div>
          ) : null}

          <div className="grid gap-4">
            {usersQuery.data?.items.map((user) => (
              <UserCard key={user.id} user={user} onDelete={handleDelete} />
            ))}
          </div>

          {usersQuery.data ? (
            <div className="flex flex-col gap-3 rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Page {usersQuery.data.meta.page} of {usersQuery.data.meta.totalPages} · {usersQuery.data.meta.total} total users
              </p>
              <div className="flex items-center gap-3">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= usersQuery.data.meta.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-soft xl:sticky xl:top-28 xl:h-fit">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Form state workspace</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">Invite a user</h2>
            </div>
            {userComposerOpen ? (
              <Button variant="ghost" onClick={closeUserComposer}>
                Hide
              </Button>
            ) : null}
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            Validation, dirty tracking, and submit orchestration stay local inside React Hook Form.
          </p>

          <div className="mt-6">
            {userComposerOpen ? (
              <CreateUserForm onSuccess={closeUserComposer} />
            ) : (
              <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                <p className="text-lg font-semibold text-slate-950">Composer is tucked away</p>
                <p className="mt-2 text-sm text-slate-500">Open it when you want to create a new user with full schema validation.</p>
                <Button className="mt-5" onClick={openUserComposer}>
                  Start invitation
                </Button>
              </div>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
