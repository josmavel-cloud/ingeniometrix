import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { issueSessionToken } from "@/server/auth/session";
import { readDefinition } from "@/server/projects/conversational-definition-service";
import { submitIntakeTurn } from "@/server/projects/intake-conversation-service";

const origin = "http://127.0.0.1:3417";
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated DB only");
  const user = await prisma.user.create({ data: { email: `phase1-browser-${randomUUID()}@example.test` } });
  const otherUser = await prisma.user.create({ data: { email: `phase1-browser-other-${randomUUID()}@example.test` } });
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
    const until = async (expression: string) => { for (let i = 0; i < 120; i++) { if (await evaluate(`Boolean(document.body) && (${expression})`)) return; await delay(150); } const safePage = await evaluate("({path:location.pathname,title:document.title,text:document.body?.innerText.slice(0,500)})"); throw new Error(`Browser condition timeout: ${expression}; page=${JSON.stringify(safePage)}`); };
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
    // Simulated conversation reproduces the real stale-ambiguity bug; no model
    // or provider request. Browser still uses the normal action/confirm routes.
    for (const answering of [false, true]) {
      const v = (await readDefinition(user.id, projectId))!;
      const requestId = randomUUID();
      const result = await submitIntakeTurn(user.id, projectId, { requestId, baseRevision: v.revision, etag: v.etag, message: answering ? "Relatos en Lima" : "Precisar el contexto" }, async () => ({
        schemaVersion: "intake-turn.v1", baseRevision: v.revision, assistantText: answering ? "Propongo conservar el contexto que indicaste." : "¿Qué contexto quieres conservar?",
        proposedChanges: answering ? [{ field: "context", value: "Relatos de estudiantes migrantes en Lima", origin: "AI_INFERRED", knowledge: "KNOWN", sourceMessageIds: [requestId], interpretationConfidence: "HIGH" }] : [],
        ambiguities: answering ? [] : [{ field: "context", question: "¿Qué contexto quieres conservar?", blocksSearch: true }], nextQuestion: null,
      }));
      assert.equal(result.status, "COMPLETE");
    }
    await call("Page.navigate", { url: `${origin}/projects/${projectId}?step=define` });
    await until("document.body.innerText.includes('Relatos y experiencias de estudiantes migrantes')");
    await until("Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Guardar aclaración')");
    await click("Revisar definición");
    await until("Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Confirmar para buscar evidencia' && e.disabled)");
    await click("Correcto");
    await until("!Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Guardar aclaración')");
    await click("Revisar definición"); await until("document.body.innerText.includes('Esto entendimos para buscar evidencia')");
    await until("Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Confirmar para buscar evidencia' && !e.disabled)");
    // Another tab edits after this tab reviewed: server must reject the old
    // confirmation and the UI must offer explicit conflict recovery.
    const otherTabStatus = await evaluate(`(async()=>{const {state}=await fetch('/api/projects/${projectId}/definition').then(r=>r.json()); return (await fetch('/api/projects/${projectId}/definition',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),baseRevision:state.revision,etag:state.etag,action:{kind:'EDIT',field:'purpose',value:'Comprender las experiencias de pertenencia',knowledge:'KNOWN'}})})).status})()`);
    assert.equal(otherTabStatus, 200);
    await click("Confirmar para buscar evidencia");
    await until("document.body.innerText.includes('Cargar revisión para comparar')");
    assert.equal(await prisma.intake.count({ where: { projectId } }), 0);
    await click("Cargar revisión para comparar");
    await until("!document.body.innerText.includes('Cargar revisión para comparar')");
    await click("Revisar definición");
    await until("Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Confirmar para buscar evidencia' && !e.disabled)");
    await click("Confirmar para buscar evidencia");
    await until("location.search === '?step=evidence' && document.body.innerText.includes('Busca fuentes académicas para comenzar')");
    const intake = await prisma.intake.findUniqueOrThrow({ where: { projectId } });
    assert.equal(intake.targetPopulation, "Relatos y experiencias de estudiantes migrantes");
    assert.ok(intake.confirmedDefinitionJson);
    const api = await evaluate(`fetch('/api/projects/${projectId}/definition?view=search-intent').then(r=>r.json())`);
    assert.equal(api.intent.readiness, "READY"); assert.equal(api.intent.methodologicalSignals.length, 0);
    await call("Page.reload"); await until("document.body.innerText.includes('Busca fuentes académicas para comenzar')");
    assert.ok(await evaluate("document.body.innerText.toLowerCase().includes('investigacion definida')"), "Confirmed definition is not labelled Base por definir");
    await call("Page.navigate", { url: `${origin}/projects` });
    await until(`Boolean(document.querySelector('a[href="/projects/${projectId}"]'))`);
    await evaluate(`document.querySelector('a[href="/projects/${projectId}"]').click()`);
    await until("document.body.innerText.includes('Busca fuentes académicas para comenzar')");
    assert.equal(await prisma.auditLog.count({ where: { projectId, eventType: { in: ["SEARCH_INPUT_FROZEN", "SEARCH_COMPLETED"] } } }), 0);
    // Isolated audit fixture, not a scholarly search: distinguish post-search
    // zero-admission from the pre-search state through the real rendering path.
    await prisma.auditLog.create({ data: { userId: user.id, projectId, actorType: "SYSTEM", eventType: "SEARCH_COMPLETED", payloadJson: { referenceSearchVersion: "v2", searchSnapshot: {
      referenceSearchVersion: "v2", savedAt: new Date().toISOString(), searchQuery: "offline fixture", attemptedQueries: [], totalResults: 0,
      providerBreakdown: { openAlex: 0, crossref: 0 }, baseSelectedReferenceIds: [], references: [],
      metadata: { planSource: "fallback", normalizedTopic: "offline fixture", intentSummary: "Offline acceptance only", keywordGroups: { necessary: [], complementary: [], optional: [] }, queryPack: { necessaryOnly: [], complementaryBoosted: [], optionalBackups: [] }, focusTerms: [], scoringRules: [] },
    } } } });
    await call("Page.reload");
    await until("document.body.innerText.includes('No encontramos fuentes suficientemente pertinentes en este lote.')");
    const artifact = path.resolve("artifacts-local/rc4/phase1-browser"); await mkdir(artifact, { recursive: true });
    const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join(artifact, "desktop.png"), Buffer.from(screenshot.data, "base64"));
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const mobile = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join(artifact, "mobile.png"), Buffer.from(mobile.data, "base64"));
    assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "No mobile horizontal overflow");
    await call("Network.clearBrowserCookies"); await call("Page.reload");
    await until("location.pathname === '/workspace'");
    const unauthorized = await fetch(`${origin}/api/projects/${projectId}/definition`, { redirect: "manual" });
    assert.notEqual(unauthorized.status, 200);
    // Fresh session for this disposable identity, not a copied owner session.
    const resumed = await issueSessionToken({ userId: user.id });
    await call("Network.setCookie", { name: "imx_session", value: resumed, url: origin, httpOnly: true, sameSite: "Strict" });
    await call("Page.navigate", { url: `${origin}/projects/${projectId}` });
    await until("document.body.innerText.includes('No encontramos fuentes suficientemente pertinentes en este lote.')");
    assert.equal(await prisma.auditLog.count({ where: { projectId, eventType: "RESEARCH_DEFINITION_CONFIRMED" } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { projectId, eventType: "SEARCH_COMPLETED" } }), 1, "Only the explicit offline fixture");
    assert.equal(await prisma.auditLog.count({ where: { projectId, eventType: "SEARCH_INPUT_FROZEN" } }), 0);
    const otherToken = await issueSessionToken({ userId: otherUser.id });
    await call("Network.setCookie", { name: "imx_session", value: otherToken, url: origin, httpOnly: true, sameSite: "Strict" });
    const denied = await evaluate(`Promise.all(['/api/ui/detail/${projectId}','/api/projects/${projectId}/definition'].map(url=>fetch(url).then(r=>r.status)))`);
    assert.equal(denied[0], 404); assert.notEqual(denied[1], 200);
    await call("Page.navigate", { url: `${origin}/projects` });
    await until("document.body.innerText.includes('Aun no tienes proyectos')");
    assert.equal(await evaluate(`Boolean(document.querySelector('a[href="/projects/${projectId}"]'))`), false);
    console.log("PASS Phase1 real headless browser: canonical creation, autosave, query navigation flush, stale ambiguity/proposal acceptance, exact confirmation, automatic Sources navigation, search-intent, both empty states, reload, project-list resume, fresh-session resume, mobile, absent session denied; no executed searches; paid calls=0.");
  } finally {
    ws?.close(); chrome.kill("SIGTERM"); await delay(800);
    await rm(profile, { recursive: true, force: true });
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.auditLog.deleteMany({ where: { userId: otherUser.id } });
    await prisma.paidOperation.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.user.delete({ where: { id: otherUser.id } }); await prisma.$disconnect();
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Browser test failed"); process.exitCode = 1; });
