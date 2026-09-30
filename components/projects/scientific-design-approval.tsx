"use client";
import { useEffect, useState } from "react";

// Client-only view of the public contract; never import a DB/scientific service.
type Alternative = { id: string; label: string; scope_fulfilled: string; feasibility: string; approvable: boolean; scope_changes: { proposed_change: string; reason: string }[]; scope_change_impact?: { original_intent: string; proposed_change: string; why_needed: string; what_is_lost: string; what_is_gained: string } | null; scope?: { status: string; current_user_intent: string; recommended_scope: string; difference: string; rationale: string; confirmation_required: boolean }; definition: { questions: { id: string; text: string }[]; objectives: { id: string; text: string }[] }; research_design: { design: string; procedure: string[]; analysis_method: string; quality_criteria: string[]; limitations: string[] }; pending_user_decisions: { question: string; blocking: boolean }[]; review?: { issues: { finding: string; required_action: string }[] } };
type Decision = { fingerprint: string; expected_outcome: string; recommendation: string; alternatives: Alternative[]; clarification_questions: string[] };
export function ScientificDesignApproval({ projectId, jobId, onApproved }: { projectId: string; jobId: string; onApproved: () => void }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [scopeAccepted, setScopeAccepted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projects/${projectId}/scientific-design?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store", signal: controller.signal }).then(async (r) => {
      if (!r.ok) throw new Error("No se pudo cargar el diseño propuesto.");
      const payload = await r.json(); setDecision(payload.decision); setLoaded(true);
    }).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [projectId, jobId]);
  async function approve(option: Alternative) {
    if (!decision) return;
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/scientific-design`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, alternativeId: option.id, decisionFingerprint: decision.fingerprint, acceptScopeChanges: Boolean(scopeAccepted[option.id]) }) });
      if (!response.ok) throw new Error((await response.json()).error);
      onApproved();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo confirmar."); }
    finally { setPending(false); }
  }
  async function revise() {
    if (!decision) return;
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/scientific-design`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, decisionFingerprint: decision.fingerprint }) });
      if (!response.ok) throw new Error((await response.json()).error);
      onApproved();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo solicitar la revisión."); }
    finally { setPending(false); }
  }
  if (loaded && !decision) return null;
  return <div className="my-6 rounded-2xl border border-teal-200 bg-teal-50 p-5">
    <h3 className="text-lg font-semibold">Confirma cómo desarrollarás tu investigación</h3>
    <p className="mt-2 text-sm">La redacción continuará después de tu confirmación. Puedes volver a la definición si necesitas corregir datos o restricciones.</p>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    {!decision && !error && <p className="mt-3">Cargando propuesta guardada…</p>}
    {decision && <><p className="mt-4"><strong>Tu propósito:</strong> {decision.expected_outcome}</p><p className="mt-2">{decision.recommendation}</p>
      <p className="mt-3 text-sm">Si has guardado cambios en la definición, puedes solicitar una nueva evaluación. Consume el presupuesto restante de esta solicitud; no lo reinicia.</p>
      <button type="button" disabled={pending} className="mt-2 underline disabled:opacity-50" onClick={revise}>Reevaluar con mis cambios guardados</button>
      {decision.clarification_questions.length > 0 && <ul className="my-3 list-disc pl-5">{decision.clarification_questions.map((q) => <li key={q}>{q}</li>)}</ul>}
      {decision.alternatives.map((option) => <article key={option.id} className="mt-4 rounded-xl bg-white p-4">
        <h4 className="font-semibold">{option.label}</h4><p className="mt-2">{option.scope_fulfilled}</p><p className="mt-2">{option.research_design.design}</p>
        <details className="mt-3"><summary className="cursor-pointer font-medium">Preguntas, objetivos y procedimiento</summary>
          <ul className="my-3 list-disc pl-5">{option.definition.questions.map((q) => <li key={q.id}>{q.text}</li>)}</ul>
          <ul className="my-3 list-disc pl-5">{option.definition.objectives.map((o) => <li key={o.id}>{o.text}</li>)}</ul>
          <ol className="my-3 list-decimal pl-5">{option.research_design.procedure.map((p, i) => <li key={i}>{p}</li>)}</ol>
          <p>{option.research_design.analysis_method}</p><p className="mt-2">{option.feasibility}</p>
          <ul className="my-3 list-disc pl-5">{option.research_design.quality_criteria.map((q) => <li key={q}>{q}</li>)}</ul>
          <ul className="my-3 list-disc pl-5">{option.research_design.limitations.map((q) => <li key={q}>{q}</li>)}</ul>
        </details>
        {option.pending_user_decisions.map((p) => <p className="mt-2" key={p.question}>{p.question}</p>)}
        {option.scope_change_impact && <div className="mt-3 rounded-lg border border-amber-200 p-3 text-sm">
          <p><strong>Intención original:</strong> {option.scope_change_impact.original_intent}</p>
          <p><strong>Cambio propuesto:</strong> {option.scope_change_impact.proposed_change}</p>
          <p><strong>Motivo:</strong> {option.scope_change_impact.why_needed}</p>
          <p><strong>Qué se deja fuera:</strong> {option.scope_change_impact.what_is_lost}</p>
          <p><strong>Qué se gana:</strong> {option.scope_change_impact.what_is_gained}</p>
        </div>}
        {option.scope && <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
          <p><strong>Estado del alcance:</strong> {option.scope.status === "PENDING_USER_DECISION" ? "Requiere una decisión tuya" : option.scope.status}</p>
          <p><strong>Alcance propuesto:</strong> {option.scope.recommended_scope}</p>
          <p>{option.scope.difference}</p>
        </div>}
        {option.review?.issues.map((issue, i) => <p className="mt-2 text-sm" key={i}>{issue.finding} {issue.required_action}</p>)}
        {option.scope?.confirmation_required && option.scope.status !== "PENDING_USER_DECISION" && <label className="mt-4 flex items-start gap-2"><input type="checkbox" checked={Boolean(scopeAccepted[option.id])} onChange={(event) => setScopeAccepted({ ...scopeAccepted, [option.id]: event.target.checked })} /><span>Acepto expresamente el alcance propuesto y sus efectos.</span></label>}
        <button type="button" disabled={pending || !option.approvable || Boolean(option.scope?.confirmation_required && !scopeAccepted[option.id])} className="brand-button-primary mt-4 px-4 py-2 disabled:opacity-50" onClick={() => approve(option)}>Confirmar este diseño</button>
      </article>)}
    </>}
  </div>;
}
