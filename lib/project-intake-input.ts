// Shared input contract; safe for frontend type checking without server sources.
export type IntakeInput = {
  topic: string;
  problemContext?: string;
  researchLine?: string;
  academicConstraints?: string;
  targetPopulation?: string;
  availableData?: string;
  preferredMethodology?: string;
  advisorNotes?: string;
  researchScope?: string;
  constructs?: string;
  pendingDecisions?: string;
};
