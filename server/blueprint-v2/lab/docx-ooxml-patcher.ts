import { readFile, writeFile } from "node:fs/promises";

import JSZip from "jszip";

export type DocxOoxmlPatchReport = {
  artifact_type: "docx_ooxml_patch_report";
  artifact_version: "v1";
  docx_path: string;
  patches_applied: string[];
  warnings: string[];
};

function disableUpdateFields(settingsXml: string) {
  if (settingsXml.includes("<w:updateFields")) {
    return settingsXml.replace(/<w:updateFields\b[^>]*\/>/g, '<w:updateFields w:val="false"/>');
  }

  return settingsXml;
}

export async function patchDocxPackage(input: {
  docxPath: string;
}): Promise<DocxOoxmlPatchReport> {
  const patches: string[] = [];
  const warnings: string[] = [];
  const buffer = await readFile(input.docxPath);
  const zip = await JSZip.loadAsync(buffer);
  const settingsFile = zip.file("word/settings.xml");

  if (settingsFile) {
    const settingsXml = await settingsFile.async("string");
    const patchedSettingsXml = disableUpdateFields(settingsXml);

    if (patchedSettingsXml !== settingsXml) {
      zip.file("word/settings.xml", patchedSettingsXml);
      patches.push("word/settings.xml:disableUpdateFields");
    }
  } else {
    warnings.push("No se encontro word/settings.xml; no se pudo validar updateFields.");
  }

  if (patches.length > 0) {
    const patchedBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    await writeFile(input.docxPath, patchedBuffer);
  }

  return {
    artifact_type: "docx_ooxml_patch_report",
    artifact_version: "v1",
    docx_path: input.docxPath,
    patches_applied: patches,
    warnings,
  };
}
