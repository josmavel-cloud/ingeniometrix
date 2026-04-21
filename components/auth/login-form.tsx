"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

export function LoginForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "No se pudo iniciar la sesion.");
        return;
      }

      router.push("/projects");
      router.refresh();
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(244,241,248,0.9)] p-4 text-sm leading-6 text-[var(--color-muted)]">
        Entra con tu nombre y correo para crear tu primer proyecto y continuar en el
        workspace de Ingeniometrix.
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-semibold text-[var(--color-muted)]">Nombre</span>
        <input
          className="brand-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Como te llamamos en el workspace"
          autoComplete="name"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-semibold text-[var(--color-muted)]">Correo</span>
        <input
          className="brand-input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="tu@correo.com"
          autoComplete="email"
          required
        />
      </label>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <button
        className="brand-button-primary h-12 px-5 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Entrando..." : "Entrar al workspace"}
      </button>
    </form>
  );
}
