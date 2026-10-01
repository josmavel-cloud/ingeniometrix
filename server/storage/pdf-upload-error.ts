export type PdfFailureCategory = "BODY_LENGTH_MISMATCH" | "INVALID_PDF_SIGNATURE" |
  "PDFINFO_VALIDATION_FAILED" | "PRIVATE_STORAGE_WRITE_FAILED" | "TRANSFER_FINALIZATION_FAILED" | "OTHER_SAFE_CATEGORY";
export type PdfSafeDiagnostics = { processExitCode?: number | null; processSignal?: string | null;
  timedOut?: boolean; maxBufferExceeded?: boolean; pages?: number | null; encrypted?: boolean | null;
  inputSha256?: string | null };
export class PdfUploadError extends Error {
  constructor(readonly category: PdfFailureCategory, readonly declaredBytes: number,
    readonly receivedBytes: number, readonly stage: string,
    readonly diagnostics: PdfSafeDiagnostics = {}) { super(category); }
}
export function pdfUploadMessage(category: string) {
  const messages: Record<string, string> = {
    BODY_LENGTH_MISMATCH: "La carga quedó incompleta. Vuelve a seleccionar el PDF e inténtalo otra vez.",
    INVALID_PDF_SIGNATURE: "El archivo recibido no tiene un formato PDF válido. Revisa el archivo antes de subirlo.",
    PDFINFO_VALIDATION_FAILED: "No pudimos verificar este PDF. Conserva el archivo e inténtalo de nuevo cuando indiquemos la causa.",
    PRIVATE_STORAGE_WRITE_FAILED: "No pudimos guardar el PDF. Conserva tu archivo y vuelve a intentarlo más tarde.",
    TRANSFER_FINALIZATION_FAILED: "El PDF no pudo registrarse. Conserva tu archivo y vuelve a intentarlo.",
  };
  return messages[category] ?? "No pudimos completar la carga del PDF. Conserva tu archivo e inténtalo más tarde.";
}
