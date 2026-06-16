"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        body: JSON.stringify({ email, password }),
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
        Entra con una cuenta ya habilitada en el backend para continuar al
        workspace de Ingeniometrix.
      </div>

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

      <label className="grid gap-2">
        <span className="text-sm font-semibold text-[var(--color-muted)]">Contrasena</span>
        <input
          className="brand-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Tu contrasena de acceso"
          autoComplete="current-password"
          required
        />
      </label>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <button
        className="brand-button-primary h-12 px-5 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Verificando..." : "Iniciar sesion"}
      </button>
    </form>
  );
}
