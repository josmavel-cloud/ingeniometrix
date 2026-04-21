"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="inline-flex items-center rounded-full border border-white/16 px-4 py-2 text-sm font-medium text-slate-100 hover:border-lime-400/70 hover:bg-white/6 disabled:cursor-wait disabled:opacity-70"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.push("/");
          router.refresh();
        });
      }}
      type="button"
    >
      {isPending ? "Saliendo..." : "Salir"}
    </button>
  );
}
