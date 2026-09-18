export default function ProjectsLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Cargando workspace"
      className="min-h-screen px-4 pb-12 pt-6 sm:px-6 lg:px-8"
    >
      <section className="mx-auto mt-8 flex w-full max-w-6xl animate-pulse flex-col gap-8">
        <div className="surface-panel rounded-[38px] p-6 sm:p-8">
          <div className="h-5 w-40 rounded-full bg-[rgba(74,58,97,0.08)]" />
          <div className="mt-5 h-10 w-full max-w-xl rounded-2xl bg-[rgba(74,58,97,0.08)]" />
          <div className="mt-4 h-5 w-full max-w-2xl rounded-xl bg-[rgba(74,58,97,0.06)]" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div className="surface-panel h-44 rounded-[30px]" key={item} />
          ))}
        </div>
        <p className="text-center text-sm text-[var(--color-muted)]">
          Cargando tu workspace de Ingeniometrix...
        </p>
      </section>
    </main>
  );
}
