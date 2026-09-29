"use client";
import { useState } from "react";
export function GoogleButton({ link = false }: { link?: boolean }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  async function start() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/google/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      window.location.assign(body.url);
    } catch { setError("Google no está disponible ahora. Puedes usar tu cuenta existente."); setPending(false); }
  }
  return <div className="grid gap-3"><button onClick={start} disabled={pending} className="brand-button-primary px-5 py-3">{pending ? "Conectando con Google…" : link ? "Vincular mi cuenta con Google" : "Continuar con Google"}</button>{error && <p role="alert">{error}</p>}</div>;
}
