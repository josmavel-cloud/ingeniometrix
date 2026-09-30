import assert from "node:assert/strict";

import {
  isDanglingPublicFragment,
  trimTextToWordLimit,
} from "@/server/mvp/step6-blueprint-docx-service";

const longSingleSentence = "Objetivo general: comprender las experiencias docentes y las condiciones institucionales que inciden en la implementacion cotidiana de la retroalimentacion formativa en un contexto rural delimitado.";
const preserved = trimTextToWordLimit(longSingleSentence, 8);
assert.equal(preserved, longSingleSentence, "Una frase indivisible no debe cortarse para cumplir el presupuesto.");
assert.equal(isDanglingPublicFragment("Identificar las condiciones que inciden en."), true);
assert.equal(isDanglingPublicFragment("Identificar las condiciones institucionales que inciden en la practica docente."), false);

console.log("PASS step6 release readiness: no se generan fragmentos truncados por el presupuesto de palabras.");
