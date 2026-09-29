export const STEP5_EQUATION_LATEX_OCR_PROMPT = {
  version: "ingeniometrix-step5-equation-latex-ocr-v1",
  storage: "filesystem_prompt_registry",
  systemPrompt:
    "Transcribe one academic equation image into LaTeX using only visible notation. Do not infer missing terms.",
  userPromptTemplate: [
    "Transcribe the supplied equation crop.",
    "",
    "Equation metadata:",
    "- asset_id: {{asset_id}}",
    "- source_id: {{source_id}}",
    "- page_number: {{page_number}}",
    "- caption_or_signal_text: {{caption_or_signal_text}}",
    "",
    "Rules:",
    "- Return display math LaTeX without surrounding $$ delimiters.",
    "- Preserve symbols, subscripts, superscripts, fractions, sums, Greek letters, and parentheses.",
    "- If the crop contains several equation lines belonging to the same formula, return an aligned LaTeX block.",
    "- If the crop is incomplete or not an equation, set status accordingly and keep latex null.",
    "- Do not add explanations that are not visible in the crop.",
  ].join("\n"),
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["status", "latex", "confidence_100", "description_es", "warnings"],
    properties: {
      status: { type: "string", enum: ["transcribed", "partial", "not_equation", "failed"] },
      latex: { type: ["string", "null"] },
      confidence_100: { type: "number", minimum: 0, maximum: 100 },
      description_es: { type: "string" },
      warnings: { type: "array", items: { type: "string" } },
    },
  },
} as const;
