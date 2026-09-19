"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { SupportedLanguage } from "@/lib/language";
import { getProjectUiCopy } from "@/lib/project-ui-copy";

type LogoutButtonProps = {
  language?: SupportedLanguage;
};

export function LogoutButton({ language = "es" }: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const copy = getProjectUiCopy(language).action;

  return (
    <button
      className="brand-button-secondary px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
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
      {isPending ? copy.closingSession : copy.closeSession}
    </button>
  );
}
