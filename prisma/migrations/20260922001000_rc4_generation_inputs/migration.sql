CREATE TABLE "GenerationInputSnapshot" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "draftId" TEXT,
  "draftRevision" INTEGER,
  "contentHash" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GenerationInputSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GenerationInputSnapshot_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "GenerationInputSnapshot_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BlueprintJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GenerationInputSnapshot_jobId_revision_key" ON "GenerationInputSnapshot"("jobId", "revision");
CREATE FUNCTION reject_generation_input_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Generation inputs are immutable; append a revision instead';
END;
$$;
CREATE TRIGGER "GenerationInputSnapshot_immutable" BEFORE UPDATE ON "GenerationInputSnapshot"
FOR EACH ROW EXECUTE FUNCTION reject_generation_input_update();
