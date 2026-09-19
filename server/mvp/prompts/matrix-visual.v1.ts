export const MATRIX_VISUAL_PROMPT = {
  id: "consistency-matrix-visual",
  version: "ingeniometrix-consistency-matrix-visual-v1",
  model: "gpt-image-2.5-sunburst",
  quality: "high",
  count: 1,
  purpose: "Crear la composicion editorial de fondo para una matriz de consistencia cuyo texto exacto se superpone deterministicamente.",
  variables: ["panel_count", "row_count", "palette", "layout_constraints"],
  expected_schema: "PNG de fondo sin texto; el contenido semantico se compone despues desde la matriz estructurada validada",
  max_output_tokens: null,
  systemPrompt: `Create a clean landscape academic matrix backdrop for a research proposal. Use a white background, subtle muted teal and slate bands, restrained geometric separators and generous whitespace. It must look like a professional editorial table composition, not a concept map. Do not include any words, letters, numbers, icons that imply findings, charts, citations, identifiers, logos or watermarks. Do not invent scientific content. Exact matrix text will be added deterministically after generation.`,
  userPromptTemplate: `LAYOUT_SPECIFICATION:
{{layout_json}}`,
} as const;
