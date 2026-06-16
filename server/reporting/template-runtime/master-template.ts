import { loadTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";

export const MASTER_TEMPLATE_LATAM_KEY = "MASTER_TEMPLATE_LATAM";

export async function loadMasterTemplateRuntime() {
  return loadTemplateVersionRuntime({
    templateKey: MASTER_TEMPLATE_LATAM_KEY,
  });
}
