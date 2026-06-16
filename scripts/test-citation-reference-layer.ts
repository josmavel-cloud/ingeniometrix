import { buildCitationReferenceLayerForDiagnostics } from "../server/blueprint-v2/lab/academic-document-compiler";
import { placeCitationInAcademicTextForDiagnostics } from "../server/blueprint-v2/lab/docx-renderer";
import type { SecondaryReferenceCandidatesReport } from "../server/blueprint-engine/quality/method-generation-contract";
import type { BlueprintSourceRecord } from "../server/blueprint-v2/types";

type TestResult = {
  name: string;
  passed: boolean;
  details?: string;
};

function test(name: string, passed: boolean, details?: string): TestResult {
  return { name, passed, details };
}

function source(index: number): BlueprintSourceRecord {
  return {
    source_id: `source-${index}`,
    reference_id: `ref-${index}`,
    origin: "selected_source",
    label: `Fuente ${index}`,
    title: `Articulo academico ${index}`,
    normalized_title: `articulo academico ${index}`,
    doi: `10.0000/example.${index}`,
    authors: [`Autora ${index}`],
    year: 2020 + index,
    venue: "Revista academica",
    abstract: "Resumen academico sintetico.",
    landing_page_url: null,
    pdf_url: null,
    query: null,
    snippet: null,
    selected_order: index,
    citation_count: null,
    is_open_access: true,
    raw_openalex_json: null,
    raw_crossref_json: null,
    eligible_for_formal_reference: true,
  };
}

const secondaryReport: SecondaryReferenceCandidatesReport = {
  artifact_type: "secondary_reference_candidates",
  artifact_version: "v1",
  generated_at: "2026-01-01T00:00:00.000Z",
  candidate_count: 1,
  candidates: [
    {
      marker: "Autor Secundario, 2019",
      evidence_id: "evidence-1",
      source_id: "source-1",
      snippet: "Un articulo recuperado menciona a Autor Secundario, 2019.",
      status: "not_recovered_source",
      use_policy: "do_not_cite_as_primary_until_recovered",
    },
  ],
  warnings: [],
};

const paragraphContent = [
  "El primer argumento sintetiza la evidencia recuperada y establece un punto de partida para la comparacion academica.",
  "El segundo argumento discute una condicion metodologica que requiere trazabilidad y prudencia interpretativa.",
  "El tercer argumento integra una limitacion y evita afirmar resultados que no fueron ejecutados.",
  "El cuarto argumento cierra la relacion entre evidencia, alcance y decision metodologica.",
].join("\n\n");

const paragraphLayer = buildCitationReferenceLayerForDiagnostics({
  sectionKey: "state_of_the_art",
  title: "Estado del arte",
  content: paragraphContent,
  sourceRegistry: [source(1), source(2), source(3), source(4), source(5)],
  secondaryReferenceReport: secondaryReport,
});

const bulletLayer = buildCitationReferenceLayerForDiagnostics({
  sectionKey: "scope_and_limitations",
  title: "Alcances y limitaciones",
  content: [
    "- Primer alcance delimitado por evidencia recuperada.",
    "- Segunda limitacion formulada con soporte documental.",
    "- Tercer criterio que requiere validacion posterior.",
  ].join("\n"),
  sourceRegistry: [source(1), source(2), source(3)],
});

const longText = [
  "La primera oracion contiene el planteamiento central que requiere una cita cercana.",
  "La segunda oracion desarrolla la explicacion sin obligar a que la referencia quede siempre al final.",
  "La tercera oracion conserva la lectura fluida del parrafo academico.",
].join(" ");
const placedCitation = placeCitationInAcademicTextForDiagnostics(longText, "(Autora, 2025)");

const primaryReferences = paragraphLayer.references.filter(
  (reference) => reference.reference_kind !== "secondary_unrecovered",
);
const secondaryReferences = paragraphLayer.references.filter(
  (reference) => reference.reference_kind === "secondary_unrecovered",
);
const bulletCitationBlocks = bulletLayer.blocks.filter(
  (block) => block.block_type === "bullet" && block.citation_anchor_ids.length > 0,
);

const results: TestResult[] = [
  test(
    "citation anchors distribute up to four current sources",
    paragraphLayer.citation_anchors.length === 4 &&
      new Set(paragraphLayer.citation_anchors.map((anchor) => anchor.paragraph_index)).size >= 3,
    JSON.stringify(paragraphLayer.citation_anchors),
  ),
  test(
    "bullet blocks preserve citation anchors",
    bulletCitationBlocks.length >= 2,
    JSON.stringify(bulletLayer.blocks),
  ),
  test(
    "long paragraph can place citation near the first supported sentence",
    placedCitation.indexOf("(Autora, 2025)") > 0 &&
      placedCitation.indexOf("(Autora, 2025)") < placedCitation.lastIndexOf("."),
    placedCitation,
  ),
  test(
    "primary references remain separated from secondary unrecovered references",
    primaryReferences.length === 5 &&
      secondaryReferences.length === 1 &&
      secondaryReferences[0]?.recovery_status === "detected_in_recovered_pdf_not_yet_recovered",
    JSON.stringify(paragraphLayer.references),
  ),
  test(
    "secondary references are explicitly not primary citations",
    /no citar como fuente primaria/i.test(secondaryReferences[0]?.apa_reference ?? ""),
    secondaryReferences[0]?.apa_reference,
  ),
];

const failed = results.filter((result) => !result.passed);

for (const result of results) {
  console.log(
    `${result.passed ? "PASS" : "FAIL"} ${result.name}${
      result.details ? ` :: ${result.details}` : ""
    }`,
  );
}

console.log(`\nCitation/reference layer self-diagnostic: ${results.length - failed.length}/${results.length} passed`);

if (failed.length > 0) {
  process.exitCode = 1;
}
