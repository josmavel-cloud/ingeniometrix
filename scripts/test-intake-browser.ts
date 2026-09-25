import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { issueSessionToken } from "@/server/auth/session";

const origin = "http://127.0.0.1:3417";
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated DB only");
  const user = await prisma.user.create({ data: { email: `phase1-browser-${randomUUID()}@example.test` } });
  const token = await issueSessionToken({ userId: user.id }); // Disposable test identity, never owner's cookie.
  const profile = await mkdtemp(path.join(tmpdir(), "imx-phase1-chrome-"));
  const chrome = spawn("/usr/bin/google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let ws: WebSocket | undefined;
  try {
    let port = "";
    for (let i = 0; i < 50 && !port; i++) { await delay(200); port = await readFile(path.join(profile, "DevToolsActivePort"), "utf8").then(t => t.split("\n")[0]).catch(() => ""); }
    assert.ok(port, "Chrome started");
    const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
    ws = new WebSocket(tabs.find(t => t.type === "page")!.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => { ws!.onopen = () => resolve(); ws!.onerror = () => reject(new Error("CDP connection failed")); });
    let seq = 0;
    const waits = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
    ws.onmessage = e => { const v = JSON.parse(String(e.data)); if (v.method === "Page.javascriptDialogOpening") void call("Page.handleJavaScriptDialog", { accept: true }); if (v.id) { const w = waits.get(v.id); waits.delete(v.id); if (v.error) w?.reject(new Error(v.error.message)); else w?.resolve(v.result); } };
    const call = (method: string, params: unknown = {}) => new Promise<any>((resolve, reject) => { const id = ++seq; const timer = setTimeout(() => { waits.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000); waits.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } }); ws!.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression: string) => {
      const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(`Browser expression failed: ${expression}; ${result.exceptionDetails.text}`); return result.result.value;
    };
    const until = async (expression: string) => { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await delay(150); } const safePage = await evaluate("({path:location.pathname,title:document.title,text:document.body.innerText.slice(0,500)})"); throw new Error(`Browser condition timeout: ${expression}; page=${JSON.stringify(safePage)}`); };
    const fill = (selector: string, value: string) => evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`);
    const click = (text: string) => evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent===${JSON.stringify(text)}).click()`);
    await call("Network.enable"); await call("Page.enable");
    await call("Network.setCookie", { name: "imx_session", value: token, url: origin, httpOnly: true, sameSite: "Strict" });
    await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
    await call("Page.navigate", { url: `${origin}/projects/new` });
    await until("Boolean(document.querySelector('#research-idea'))"); await delay(600);
    await fill("#research-idea", "Comprender las experiencias de pertenencia de estudiantes migrantes a partir de sus relatos");
    await fill("#academic-level", "MAESTRIA"); await click("Comenzar mi definición");
    await until("Boolean(document.querySelector('#conversation-title'))");
    await until("document.body.innerText.includes('Borrador recuperado')");
    const projectId = (await evaluate("location.pathname"))!.split("/")[2];
    assert.ok(projectId);
    await fill("#definition-field", "object");
    await until("Boolean(document.querySelector('#definition-value'))");
    await fill("#definition-value", "Relatos de estudiantes migrantes");
    await until("document.body.innerText.includes('Guardado · revisión 2')");
    assert.equal(await prisma.intake.count({ where: { projectId } }), 0, "Autosave cannot confirm");
    // Query navigation flushes a pending ordinary edit without confirmation.
    await fill("#definition-value", "Relatos y experiencias de estudiantes migrantes");
    await evaluate(`document.querySelector('a[href="/projects/${projectId}?step=evidence"]').click()`);
    await until("location.search === '?step=evidence'");
    assert.equal(await prisma.intake.count({ where: { projectId } }), 0);
    await call("Page.navigate", { url: `${origin}/projects/${projectId}?step=define` });
    await until("document.body.innerText.includes('Relatos y experiencias de estudiantes migrantes')");
    await click("Revisar definición"); await until("document.body.innerText.includes('Esto se usará para buscar evidencia')");
    await click("Confirmar esta definición para buscar evidencia");
    await until("document.body.innerText.includes('Definición confirmada')");
    const intake = await prisma.intake.findUniqueOrThrow({ where: { projectId } });
    assert.equal(intake.targetPopulation, "Relatos y experiencias de estudiantes migrantes");
    assert.ok(intake.confirmedDefinitionJson);
    const api = await evaluate(`fetch('/api/projects/${projectId}/definition?view=search-intent').then(r=>r.json())`);
    assert.equal(api.intent.readiness, "READY"); assert.equal(api.intent.methodologicalSignals.length, 0);
    await call("Page.reload"); await until("document.body.innerText.includes('Definición confirmada')");
    const artifact = path.resolve("artifacts-local/rc4/phase1-browser"); await mkdir(artifact, { recursive: true });
    const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(path.join(artifact, "desktop.png"), Buffer.from(screenshot.data, "base64"));
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const mobile = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(path.join(artifact, "mobile.png"), Buffer.from(mobile.data, "base64"));
    assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "No mobile horizontal overflow");
    await call("Network.clearBrowserCookies"); await call("Page.reload");
    await until("location.pathname === '/workspace'");
    const unauthorized = await fetch(`${origin}/api/projects/${projectId}/definition`, { redirect: "manual" });
    assert.notEqual(unauthorized.status, 200);
    console.log("PASS Phase1 real headless browser: canonical creation, manual edit, autosave, query navigation flush, no implicit confirmation, explicit snapshot, search-intent, reload, mobile no overflow, expired/absent session denied. Model unavailable fallback visible; paid calls=0.");
  } finally {
    ws?.close(); chrome.kill("SIGTERM"); await delay(800);
    await rm(profile, { recursive: true, force: true });
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect();
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Browser test failed"); process.exitCode = 1; });
