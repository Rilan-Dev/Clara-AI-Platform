import Link from "next/link";
import { ArrowRight, Boxes, Cable, FormInput, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/Button";

const pillars = [
  {
    title: "Centralized endpoints",
    description: "Every API path lives in one file so components stay presentation-focused.",
    icon: Cable,
  },
  {
    title: "Server state discipline",
    description: "TanStack Query owns remote data, caching, pagination, and invalidation.",
    icon: Layers3,
  },
  {
    title: "Form-native validation",
    description: "React Hook Form and Zod handle input state without leaking it into global stores.",
    icon: FormInput,
  },
  {
    title: "Feature-first structure",
    description: "Users is implemented end-to-end so you can mirror the same shape for more modules.",
    icon: Boxes,
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="grid gap-6 rounded-[40px] border border-white/70 bg-white/85 p-6 shadow-soft sm:p-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10 lg:p-10">
        <div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
            Next.js infrastructure
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
            A production-ready App Router reference with real state boundaries.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            This project shows how to compose Zustand, TanStack Query, React Hook Form, and TypeScript without smearing concerns across pages and components.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/users">
              <Button size="lg">
                Explore the users module
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <div className="rounded-full border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              Default API base: <span className="font-mono">/api</span>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] bg-slate-950 p-6 text-white shadow-soft">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">State ownership map</p>
          <dl className="mt-6 space-y-5 text-sm text-white/80">
            <div>
              <dt className="text-white/50">Zustand</dt>
              <dd className="mt-1 text-lg font-semibold text-white">UI shell state + toasts</dd>
            </div>
            <div>
              <dt className="text-white/50">React Query</dt>
              <dd className="mt-1 text-lg font-semibold text-white">Users list, detail, cache invalidation</dd>
            </div>
            <div>
              <dt className="text-white/50">React Hook Form</dt>
              <dd className="mt-1 text-lg font-semibold text-white">Create-user workflow and validation</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {pillars.map((pillar) => (
          <article key={pillar.title} className="rounded-[30px] border border-white/70 bg-white/90 p-6 shadow-soft">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <pillar.icon className="size-5" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-slate-950">{pillar.title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{pillar.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
