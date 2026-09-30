import { SCIENTIFIC_DESIGN_SELECTOR_PROMPT as v2 } from "./scientific-design-selector.v2";

// The first live v2 response exhausted 8192 tokens (including reasoning) before
// closing the JSON. Preserve scientific requirements; bound prose, not fields.
export const SCIENTIFIC_DESIGN_SELECTOR_PROMPT = {
  ...v2,
  version: "ingeniometrix-scientific-design-selector-v3",
  max_output_tokens: 12288,
  systemPrompt: `${v2.systemPrompt}
Economía de expresión: normalmente devuelve UNA alternativa bien fundamentada, con texto total orientativo de hasta 1400 palabras. Solo agrega otra si representa una decisión científica realmente distinta y sustentada. Conserva TODOS los campos requeridos, las relaciones, el soporte y las incertidumbres; usa frases precisas, sin repetir la misma justificación en varios campos. No omitas requisitos científicos para acortar. Cierra siempre el objeto JSON completo.`,
} as const;
