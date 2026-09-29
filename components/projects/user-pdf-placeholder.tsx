import { FileUp } from "lucide-react";

import { MAX_USER_PDFS } from "@/lib/user-pdf-contract";

export function UserPdfPlaceholder() {
  return (
    <section className="rounded-[28px] border border-dashed border-[rgba(74,58,97,0.16)] bg-white/70 p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(219,193,255,0.3)] text-[var(--color-plum)]"><FileUp className="size-4" /></span>
        <div>
          <h3 className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">PDF adicionales (opcional)</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">El contrato admite hasta {MAX_USER_PDFS} PDF, sujetos a relevancia y validación. La carga se habilitará en el siguiente gate; ningún archivo se acepta ni se procesa aún.</p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">El consentimiento opcional para uso interno de entrenamiento se solicitará por separado y no condicionará el uso del documento como fuente del proyecto.</p>
          <button className="brand-button-secondary mt-4 px-4 py-2 text-sm font-semibold opacity-60" disabled type="button">Carga aun no disponible</button>
        </div>
      </div>
    </section>
  );
}
