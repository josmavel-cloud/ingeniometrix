import { createHash } from "node:crypto";

export const METHOD_HANDOFF_NORMALIZATION_VERSION = "declared-method-handoff-artifacts.v1";
type Component = { name: string; inputs: string[]; outputs: string[]; dependencies: string[] };
type Handoff = { from: string; to: string; transferred_output: string; use_by_next_method: string };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Materialize the artifact already explicitly declared on an existing graph edge
 * into both endpoint registries. This is structural normalization, NOT inference
 * of a method, new dependency, scientific support, or semantic equivalence.
 * The raw provider checkpoint stays unchanged and the normal scientific graph
 * and independent critic validators still run on the derived representation.
 */
export function normalizeDeclaredMethodHandoffs<T extends Component>(components: T[], handoffs: Handoff[]) {
  const originalFingerprint = hash({ components, handoffs });
  const names = new Set(components.map(component => component.name));
  if (names.size !== components.length) throw new Error("METHOD_HANDOFF_NORMALIZATION_DUPLICATE_COMPONENT");
  const normalized = components.map(component => ({ ...component, inputs: [...component.inputs], outputs: [...component.outputs], dependencies: [...component.dependencies] }));
  const changes: Array<{ edgeIndex: number; from: string; to: string; declaredArtifact: string; sourceOutputAdded: boolean; targetInputAdded: boolean }> = [];
  for (const [edgeIndex, edge] of handoffs.entries()) {
    const from = normalized.find(component => component.name === edge.from);
    const to = normalized.find(component => component.name === edge.to);
    if (!from || !to || from === to || !to.dependencies.includes(from.name) || !edge.transferred_output.trim() || !edge.use_by_next_method.trim())
      throw new Error("METHOD_HANDOFF_NORMALIZATION_INVALID_EDGE");
    const sourceOutputAdded = !from.outputs.includes(edge.transferred_output);
    const targetInputAdded = !to.inputs.includes(edge.transferred_output);
    if (sourceOutputAdded) from.outputs.push(edge.transferred_output);
    if (targetInputAdded) to.inputs.push(edge.transferred_output);
    if (sourceOutputAdded || targetInputAdded) changes.push({ edgeIndex, from: edge.from, to: edge.to,
      declaredArtifact: edge.transferred_output, sourceOutputAdded, targetInputAdded });
  }
  return { components: normalized as T[], audit: { version: METHOD_HANDOFF_NORMALIZATION_VERSION,
    originalFingerprint, normalizedFingerprint: hash({components: normalized, handoffs}), changes } };
}
