-- Additive rollout: historical intakes have no fabricated provenance.
ALTER TABLE "Project" ALTER COLUMN "program" DROP NOT NULL;
ALTER TABLE "Intake" ADD COLUMN "confirmedDefinitionJson" JSONB;
CREATE TABLE "IntakeTurn" (
  "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL, "requestId" TEXT NOT NULL, "inputHash" TEXT NOT NULL,
  "baseRevision" INTEGER NOT NULL, "kind" TEXT NOT NULL, "inputJson" JSONB NOT NULL,
  "status" TEXT NOT NULL, "resultJson" JSONB, "resultingRevision" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntakeTurn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  CONSTRAINT "IntakeTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "IntakeTurn_projectId_requestId_key" ON "IntakeTurn"("projectId", "requestId");
CREATE UNIQUE INDEX "IntakeTurn_projectId_sequence_key" ON "IntakeTurn"("projectId", "sequence");
CREATE FUNCTION protect_completed_intake_turn() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('COMPLETE', 'FAILED', 'STALE') THEN
    RAISE EXCEPTION 'Completed intake turn is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER intake_turn_immutable BEFORE UPDATE ON "IntakeTurn"
  FOR EACH ROW EXECUTE FUNCTION protect_completed_intake_turn();
