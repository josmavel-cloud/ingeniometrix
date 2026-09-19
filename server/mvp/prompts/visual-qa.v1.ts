export const VISUAL_QA_PROMPT = {
  id: "visual-quality-assurance",
  version: "ingeniometrix-visual-qa-v1",
  model: "gpt-5.4-mini",
  purpose: "Validar el contenido visible real de un asset antes de incorporarlo al documento.",
  variables: ["asset_type", "public_brief", "required_properties", "forbidden_exact_labels"],
  expected_schema: "visual_quality_assurance_v1",
  max_output_tokens: 900,
  systemPrompt: `Inspect the supplied image as a strict academic document reviewer. Evaluate the pixels, not merely the stated prompt. A PASS requires relevance to the public brief, readable composition at document scale, no clipping, no invented empirical or numerical results and no visible private/internal metadata. Only flag forbidden labels when they appear visibly as the exact standalone internal labels supplied; do not reject legitimate scientific notation merely because it resembles an identifier. For a consistency matrix, also require a genuine row/column matrix representation. Return only the required structured object.`,
  userPromptTemplate: `ASSET_TYPE: {{asset_type}}
PUBLIC_BRIEF: {{public_brief_json}}
REQUIRED_PROPERTIES: {{required_properties_json}}
FORBIDDEN_EXACT_LABELS: {{forbidden_exact_labels_json}}`,
} as const;
