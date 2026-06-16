import { evaluateEvidencePreMaterializationGate } from "@/blueprint_launch/server/source-evidence-planning";
import type { BlueprintLaunchEvidencePlanningMaterializationItem } from "@/blueprint_launch/server/local-playground-store";
import { shouldStopAfterEvidencePlanningGate } from "@/scripts/run-evidence-selected-sources-steps-2-6";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function planItem(input: {
  sourceId: string;
  expectedKind?: BlueprintLaunchEvidencePlanningMaterializationItem["expectedKind"];
  contentUrl?: string | null;
  validationNotes?: string[];
}): BlueprintLaunchEvidencePlanningMaterializationItem {
  return {
    sourceId: input.sourceId,
    title: `Current intake source ${input.sourceId}`,
    expectedKind: input.expectedKind ?? "pdf",
    resolverFamily: input.expectedKind === "unknown" ? "metadata_only" : "publisher_pdf",
    contentUrl: input.contentUrl ?? `https://example.org/${input.sourceId}.pdf`,
    priority: "high",
    languageDetected: "en",
    accessKind: input.expectedKind === "unknown" ? "abstract_only" : "pdf",
    riskFlags: [],
    validationNotes: input.validationNotes ?? [],
  };
}

function run() {
  const plausibleWithWarnings = evaluateEvidencePreMaterializationGate({
    sourceIntakeGateDecision: "PASS_WITH_WARNINGS",
    materializationPlan: [
      planItem({ sourceId: "source-a" }),
      planItem({ sourceId: "source-b" }),
      planItem({ sourceId: "source-c", expectedKind: "unknown", contentUrl: null }),
    ],
    evidenceWarnings: [
      "La suficiencia metodologica es probable pero debe confirmarse con texto completo.",
    ],
  });

  assert(
    plausibleWithWarnings.decision === "PASS_WITH_WARNINGS",
    "PDFs plausibles con warnings no deben producir BLOCK pre-PDF.",
  );
  assert(
    plausibleWithWarnings.preMaterializationDecision === "PROCEED_TO_LIMITED_INSPECTION",
    "PDFs plausibles con warnings deben recomendar inspeccion limitada.",
  );
  assert(
    plausibleWithWarnings.replacementRecommendedSourceIds.includes("source-c"),
    "Fuente sin texto completo debe quedar marcada para reemplazo.",
  );
  assert(
    !shouldStopAfterEvidencePlanningGate({
      evidencePlanning: plausibleWithWarnings,
      allowBlocked: false,
    }),
    "El runner no debe detener Step 3 cuando solo hay advertencias de suficiencia pre-PDF.",
  );

  const noFullText = evaluateEvidencePreMaterializationGate({
    sourceIntakeGateDecision: "PASS",
    materializationPlan: [
      planItem({ sourceId: "source-a", expectedKind: "unknown", contentUrl: null }),
      planItem({ sourceId: "source-b", expectedKind: "unknown", contentUrl: null }),
    ],
  });

  assert(noFullText.decision === "BLOCK", "Sin fuentes inspeccionables debe bloquear.");
  assert(
    noFullText.preMaterializationDecision === "BLOCK_ACCESS_OR_IDENTITY",
    "Sin texto completo debe clasificarse como bloqueo de acceso/identidad.",
  );
  assert(
    shouldStopAfterEvidencePlanningGate({ evidencePlanning: noFullText, allowBlocked: false }),
    "El runner debe detener bloqueos reales de acceso/identidad.",
  );

  const suspiciousButEnoughHealthy = evaluateEvidencePreMaterializationGate({
    sourceIntakeGateDecision: "PASS",
    materializationPlan: [
      planItem({ sourceId: "source-a" }),
      planItem({ sourceId: "source-b" }),
      planItem({
        sourceId: "source-c",
        validationNotes: ["PDF incorrecto o no coincide con la identidad bibliografica."],
      }),
    ],
  });

  assert(
    suspiciousButEnoughHealthy.decision === "PASS_WITH_WARNINGS",
    "Un PDF sospechoso no debe bloquear todo el set si quedan fuentes sanas suficientes.",
  );
  assert(
    suspiciousButEnoughHealthy.identityBlockedSourceIds.includes("source-c"),
    "El PDF sospechoso debe quedar marcado por identidad.",
  );

  const tooFewInspectable = evaluateEvidencePreMaterializationGate({
    sourceIntakeGateDecision: "PASS",
    materializationPlan: [
      planItem({ sourceId: "source-a" }),
      planItem({ sourceId: "source-b", expectedKind: "unknown", contentUrl: null }),
    ],
  });

  assert(tooFewInspectable.decision === "BLOCK", "Una sola fuente inspeccionable debe bloquear.");
  assert(
    tooFewInspectable.preMaterializationDecision === "NEEDS_SOURCE_REPLACEMENT",
    "Insuficiencia de fuentes inspeccionables debe pedir reemplazo.",
  );
  assert(
    shouldStopAfterEvidencePlanningGate({ evidencePlanning: tooFewInspectable, allowBlocked: false }),
    "El runner debe detener cuando se requieren reemplazos antes de inspeccionar.",
  );
  assert(
    !shouldStopAfterEvidencePlanningGate({ evidencePlanning: tooFewInspectable, allowBlocked: true }),
    "--allow-blocked debe seguir reconocido por el parser/logica de runner.",
  );

  const sourceIntakeBlocked = evaluateEvidencePreMaterializationGate({
    sourceIntakeGateDecision: "BLOCK",
    materializationPlan: [planItem({ sourceId: "source-a" }), planItem({ sourceId: "source-b" })],
  });

  assert(sourceIntakeBlocked.decision === "BLOCK", "Step 2 BLOCK debe seguir bloqueando.");
  assert(
    sourceIntakeBlocked.blockingCategory === "source_intake_gate",
    "Step 2 BLOCK debe conservar categoria source_intake_gate.",
  );
}

run();
console.log("test-source-evidence-planning-gates: ok");
