import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountFundingSummary } from "@/components/commercial/account-panel";

// A real historical package may coexist with internal capability. It must not be
// presented as the funding source for internal generation.
const balance = { available: 5, total: 5, reserved: 1, consumed: 0 };
for (const compact of [true, false]) {
  const internal = renderToStaticMarkup(createElement(AccountFundingSummary, { internalGenerationAuthorized: true, balance, compact }));
  assert.match(internal, /Generación interna autorizada/);
  assert.match(internal, /No necesitas comprar un paquete/);
  assert.match(internal, /límites de uso/);
  assert.doesNotMatch(internal, /Planes disponibles|5 de 5|Ver mi paquete|href=/);
}
for (const internalGenerationAuthorized of [false, undefined]) {
  const customer = renderToStaticMarkup(createElement(AccountFundingSummary, { internalGenerationAuthorized, balance, compact: true }));
  assert.match(customer, /Planes disponibles: 5 de 5/);
  assert.match(customer, /1 en preparación/);
  assert.match(customer, /href="\/account"/);
  assert.doesNotMatch(customer, /Generación interna autorizada/);
}
console.log("PASS: internal funding display replaces package balance; normal and legacy account snapshots retain commercial display.");
