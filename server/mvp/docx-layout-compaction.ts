import { readFile, writeFile } from "node:fs/promises";
import JSZip from "jszip";

// Layout only: no font-size changes, no text/citation/table edits, no image scaling.
// Keep image paragraph line heights and the existing 1.15 line spacing untouched.
export async function compactDocxWhitespace(file: string) {
  const zip = await JSZip.loadAsync(await readFile(file));
  let changes = 0;
  for (const name of ["word/document.xml", "word/styles.xml"]) {
    const entry = zip.file(name);
    if (!entry) continue;
    const xml = await entry.async("string");
    const compacted = xml.replace(/<w:spacing\b[^>]*\/>/g, (tag) => tag.replace(/w:(before|after)="(\d+)"/g, (attribute, key, raw) => {
      const original = Number(raw);
      if (original <= 40) return attribute;
      changes++;
      return `w:${key}="${Math.max(40, Math.floor(original * 0.75))}"`;
    }));
    zip.file(name, compacted);
  }
  if (changes) await writeFile(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return { changes, strategy: "paragraph spacing -25%, minimum 2pt; text/fonts/images untouched" };
}
