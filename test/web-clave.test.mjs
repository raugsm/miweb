// Reglas de contraseña y cambio de clave (src/lib/clave.ts). Corre con pnpm test:web.
import assert from "node:assert/strict";
import { test } from "node:test";

import { claveValida, mensajeClave, reglasClave, revisarCambio } from "../src/lib/clave.ts";

test("reglas: las cuatro que exige Supabase", () => {
  assert.deepEqual(reglasClave("Abcdef12").map((r) => r.ok), [true, true, true, true]);
  assert.equal(reglasClave("Abcdef12")[0].texto, "8 caracteres o más");
  assert.equal(claveValida("Abcdef12"), true);
  assert.equal(claveValida("abcdef12"), false, "sin mayúscula");
  assert.equal(claveValida("ABCDEF12"), false, "sin minúscula");
  assert.equal(claveValida("Abcdefgh"), false, "sin número");
  assert.equal(claveValida("Abc1"), false, "corta");
});

test("mensajeClave: traduce los rechazos de Supabase", () => {
  assert.match(mensajeClave("Password is known to be weak and easy to guess"), /filtraciones/);
  assert.match(mensajeClave("Password should contain at least one character of each: abc, ABC, 123"), /mayúscula/);
  assert.match(mensajeClave("Password should be at least 8 characters"), /8 caracteres/);
  assert.match(mensajeClave("New password should be different from the old password"), /ya tenías/);
  assert.match(mensajeClave("algo raro"), /No se pudo guardar/);
});

test("revisarCambio: valida antes de llamar al servidor", () => {
  assert.deepEqual(revisarCambio({ actual: "Vieja123", nueva: "Nueva123", repetir: "Nueva123" }), {});
  assert.equal(revisarCambio({ actual: "", nueva: "Nueva123", repetir: "Nueva123" }).actual, "Escribí tu contraseña actual.");
  assert.equal(revisarCambio({ actual: "Vieja123", nueva: "", repetir: "" }).nueva, "Escribí la contraseña nueva.");
  assert.equal(revisarCambio({ actual: "Vieja123", nueva: "corta", repetir: "corta" }).nueva, "Necesita 8 caracteres, una mayúscula, una minúscula y un número.");
  assert.equal(revisarCambio({ actual: "Vieja123", nueva: "Vieja123", repetir: "Vieja123" }).nueva, "Esa es la contraseña que ya tenías. Elegí una nueva.");
  assert.equal(revisarCambio({ actual: "Vieja123", nueva: "Nueva123", repetir: "" }).repetir, "Repetí la contraseña nueva.");
  assert.equal(revisarCambio({ actual: "Vieja123", nueva: "Nueva123", repetir: "Otra1234" }).repetir, "Las contraseñas no coinciden.");
});
