"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

type LoginErrorPayload = {
  error?: string;
  diagnostic?: {
    message?: string | null;
    name?: string | null;
    stage?: string | null;
  };
};

function getLoginErrorMessage(payload: LoginErrorPayload) {
  const diagnosticMessage = payload.diagnostic?.message ?? "";

  if (/exceeded the data transfer quota/i.test(diagnosticMessage)) {
    return "La base de datos de Ingeniometrix alcanzo su cuota de transferencia en Neon. Hay que ampliar el plan o liberar la cuota para entrar al workspace.";
  }

  if (/can't reach database server/i.test(diagnosticMessage)) {
    return "No se pudo conectar con la base de datos cloud. Revisa que el proyecto Neon este activo y que las variables de Vercel apunten al endpoint correcto.";
  }

  return payload.error ?? "No se pudo iniciar la sesion.";
}

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
        const payload = (await response.json()) as LoginErrorPayload;
        setError(getLoginErrorMessage(payload));
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
