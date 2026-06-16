import { buildBlueprintEngineInputFromCurrentLabAArtifact } from "@/server/blueprint-engine/adapters/current-lab-a-handoff-adapter";
import { inspectBlueprintInputForCurrentLabB } from "@/server/blueprint-engine/adapters/blueprint-input-to-current-lab-b-adapter";

function main() {
  const blueprintInput = buildBlueprintEngineInputFromCurrentLabAArtifact();
  const inspection = inspectBlueprintInputForCurrentLabB(blueprintInput);
  const compatibility = inspection.compatibility;
  const preview = inspection.import_preview;

  console.log(
    JSON.stringify(
      {
        can_proceed: compatibility.can_proceed,
        blockers: compatibility.blockers,
        warnings: compatibility.warnings,
        counts: compatibility.counts,
        quality_gate_status: compatibility.quality_gate_status,
        readiness: compatibility.readiness,
        target_steps: compatibility.target_steps,
        master_template_key: compatibility.templates.master_template_key,
        institutional_template_key: compatibility.templates.institutional_template_key,
        top_section_keys: preview?.step_7_inputs.top_section_keys ?? [],
      },
      null,
      2,
    ),
  );

  if (!compatibility.can_proceed) {
    process.exit(1);
  }
}

main();

