/** Selection is durable at 0–10; these gates apply only to progression. */
export const SOURCE_SUFFICIENCY_POLICY = "source-sufficiency.v1";
export const MIN_SELECTED_USABLE_SOURCES = 3;
export const MIN_USEFUL_SOURCE_TEXT_CHARS = 500;
export const MAX_SELECTED_SOURCES = 10;
export const MAX_AUTO_OPENALEX_QUERIES = 6;
export type RelevanceTier = "CORE" | "EXPLORATORY" | "EXCLUDED";
export type UsableSource = { id: string; tier: RelevanceTier; usable: boolean; selected: boolean };

export function sourceCounts(sources: UsableSource[]) {
  const unique = [...new Map(sources.map(source => [source.id, source])).values()];
  const usable = unique.filter(source => source.usable && source.tier !== "EXCLUDED");
  return { core: usable.filter(source => source.tier === "CORE").length,
    exploratory: usable.filter(source => source.tier === "EXPLORATORY").length,
    selected: unique.filter(source => source.selected).length,
    selectedCore: usable.filter(source => source.selected && source.tier === "CORE").length,
    selectedUsable: usable.filter(source => source.selected).length };
}

export function sourceProgression(sources: UsableSource[], fallbackExhausted: boolean) {
  const counts = sourceCounts(sources);
  const readiness = counts.selected > MAX_SELECTED_SOURCES || counts.selectedUsable < MIN_SELECTED_USABLE_SOURCES
    ? "BLOCKED" : counts.selectedCore >= 3 ? "READY"
      : counts.selectedCore >= 2 && fallbackExhausted ? "READY_WITH_LIMITATIONS" : "BLOCKED";
  return { ...counts, readiness, policyVersion: SOURCE_SUFFICIENCY_POLICY } as const;
}
