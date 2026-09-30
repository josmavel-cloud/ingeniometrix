CREATE FUNCTION reject_project_evidence_set_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Evidence sets are immutable; append a version instead';
END;
$$;
CREATE TRIGGER "ProjectEvidenceSet_immutable" BEFORE UPDATE ON "ProjectEvidenceSet"
FOR EACH ROW EXECUTE FUNCTION reject_project_evidence_set_update();
