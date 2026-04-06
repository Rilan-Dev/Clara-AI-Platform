export default function Home() {
  return (
    <div className="p-10">
      <h1 className="text-3xl font-semibold text-[color:var(--color-foreground)]">
        Clara Modules Sandbox
      </h1>
      <p className="max-w-2xl text-sm text-[color:var(--color-muted-foreground)]">
        This workspace keeps only the reusable assistant and admin document-management modules.
        Import what you need from <code className="font-mono text-xs">src/modules</code>, or run the
        demo ingest and workspace flows to explore the toolkit in action.
      </p>
    </div>
  );
}
