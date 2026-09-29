// Mechanically externalized without changing rendered instructions. Behavioural improvements require a new version.
export const INTAKE_DRAFT_SERVICE_1_PROMPT = {
  id: "intake-draft-service-generateIntakeDrafts",
  version: "ingeniometrix-intake-draft-service.v1-1",
  purpose: "generateIntakeDrafts (intake-draft-service)",
  model: "configured by caller; unchanged",
  output_schema_source: "server/projects/intake-draft-service.ts",
  token_budget: "caller / durable pre-job policy",
  actual_roles: "single concatenated Responses input",
  variables: {
  "var_0": "getLanguageInstruction(language)",
  "var_1": "topic",
  "var_2": "input.project.topicSeedText ?? \"Not provided\"",
  "var_3": "currentIntake?.problemContext ?? \"Not provided\"",
  "var_4": "currentIntake?.targetPopulation ?? \"Not provided\"",
  "var_5": "input.project.topicAreaLabel ?? \"Not provided\"",
  "var_6": "input.project.degreeLevel as DegreeLevel",
  "var_7": "getUniversityDisplayNameByCode(input.project.university)",
  "var_8": "input.project.program",
  "var_9": "input.variantSeed?.trim() || \"Create a fresh intake alternative.\"",
  "var_10": "existingDrafts"
},
  template: `
Act as an ethical academic research intake assistant for Ingeniometrix.

{{var_0}}

Goal:
Generate 3 complete, editable intake drafts from the selected project topic. The drafts should help the user clarify the project before searching sources, not write the thesis for them.

Rules:
- Never invent citations, data, measurements, findings, or field results.
- If data, population, constraints, or access are not known, state that they are pending confirmation.
- Keep each field useful and concise.
- Do not automate thesis completion or present assumptions as facts.
- Make the three drafts meaningfully different so the user can iterate.
- Preserve the user's selected topic unless a minor clarity edit is necessary.

Project context:
- topic: {{var_1}}
- seed text: {{var_2}}
- current problem context: {{var_3}}
- current target population: {{var_4}}
- area: {{var_5}}
- degree level: {{var_6}}
- university: {{var_7}}
- program: {{var_8}}
- requested variant seed: {{var_9}}

Prior drafts to avoid repeating too closely:
{{var_10}}

Return only the structured JSON object.
      `,
} as const;
