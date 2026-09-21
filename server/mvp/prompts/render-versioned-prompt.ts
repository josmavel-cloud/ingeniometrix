/** Single-pass substitution: variable contents are data, never re-interpolated. */
export function renderVersionedPrompt(prompt: { template: string; variables: Readonly<Record<string, string>> }, values: Record<string, unknown>) {
  const expected = Object.keys(prompt.variables);
  if (expected.some((key) => !(key in values)) || Object.keys(values).some((key) => !expected.includes(key))) throw new Error("PROMPT_VARIABLE_MISMATCH");
  return prompt.template.replace(/\{\{(var_\d+)\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error("PROMPT_VARIABLE_MISSING");
    return String(values[key]);
  });
}
