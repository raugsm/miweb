// Pruebas de la lectura del proveedor «GSM Theme» (sin red). Correr: node --test supabase/functions/proveedor_consultar/
// Con PROVEEDOR_COPIA=<ruta a un catálogo real guardado> también se prueba contra esa copia.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { errorDe, formulario, leerCuenta, numero, opcionesDe, saldoDe, tapar, version } from "./_shared/gsm_theme.ts";

// Forma real de imeiservicelist (18-nov): SUCCESS[0].LIST.<grupo>.SERVICES.<id>, con el saldo en ACCOUNTINFO.
const catalogo = {
  SUCCESS: [{
    MESSAGE: "Service List",
    LIST: {
      "RENT TOOLS": { GROUPNAME: "RENT TOOLS", GROUPTYPE: "REMOTE", SERVICES: {
        "648": { SERVICEID: 648, SERVICETYPE: "REMOTE", QNT: "0", SERVER: 2, MINQNT: "0", MAXQNT: "0", SERVICENAME: "Unlock tool source 2 ", CREDIT: 0.59, TIME: "Miniutes", INFO: "", "Requires.Custom": null, CUSTOM: null },
        "807": { SERVICEID: 807, SERVICETYPE: "REMOTE", QNT: 0, SERVER: 2, MINQNT: "", MAXQNT: "", SERVICENAME: "VIVO FRP OFFICIAL SERVER", CREDIT: 23, TIME: "1-10 minutes", INFO: "",
          "Requires.Custom": [{ type: "serviceimei", fieldname: "ULTRA ID", fieldtype: "text", required: "on" }], CUSTOM: null },
      } },
      "Server Default Group": { GROUPNAME: "Server Default Group", GROUPTYPE: "SERVER", SERVICES: {
        "644": { SERVICEID: 644, SERVICETYPE: "SERVER", QNT: "1", SERVER: 1, MINQNT: "1", MAXQNT: "10", SERVICENAME: "ZXW Online Account Activation (1 Year) ", CREDIT: 44.65, TIME: "Instant", INFO: "" },
      } },
      "IMEI CHECKERS": { GROUPNAME: "IMEI CHECKERS", GROUPTYPE: "IMEI", SERVICES: {
        "7": { SERVICEID: "7", SERVICETYPE: "IMEI", SERVICENAME: "iCloud check", CREDIT: "0.10", TIME: "Instant", INFO: "<b>ojo</b>", CUSTOM: { customname: "IMEI" } },
      } },
    },
    ACCOUNTINFO: { credit: "25.82 USD", creditraw: 25.82, mail: "x@y.z", currency: "USD" },
  }],
  apiversion: "1.0",
};

test("solo deja armar las dos acciones de lectura", () => {
  const f = formulario("u@x.com", "LLAVE", "imeiservicelist");
  assert.equal(f.get("action"), "imeiservicelist");
  assert.equal(f.get("requestformat"), "JSON");
  assert.ok(formulario("u", "k", "accountinfo"));
  for (const a of ["placeimeiorder", "placebulkorder", "getimeiorder", "IMEISERVICELIST", ""]) {
    assert.throws(() => formulario("u", "k", a), /accion_no_permitida/);
  }
});

test("lee el catálogo con grupo, tipo, costo y datos que pide", () => {
  const l = opcionesDe(catalogo);
  assert.equal(l.length, 4);
  assert.equal(l.filter((o) => o.tipo === "REMOTE").length, 2);
  const u = l.find((o) => o.numero_servicio === "648")!;
  assert.deepEqual([u.nombre, u.grupo, u.costo, u.demora_anunciada, u.min_qnt, u.datos_que_pide], ["Unlock tool source 2", "RENT TOOLS", 0.59, "Miniutes", 0, null]);
  assert.equal((u.cruda as { SERVICENAME: string }).SERVICENAME, "Unlock tool source 2 ");
  const v = l.find((o) => o.numero_servicio === "807")!;
  assert.equal(v.min_qnt, null);
  assert.equal((v.datos_que_pide!.requiere as unknown[]).length, 1);
  const i = l.find((o) => o.numero_servicio === "7")!;
  assert.deepEqual([i.costo, i.tipo], [0.1, "IMEI"]);
  assert.deepEqual(i.datos_que_pide, { custom: { customname: "IMEI" }, requiere: null, info: "<b>ojo</b>" });
});

test("un SERVICEID repetido entra una sola vez", () => {
  const doble = { SUCCESS: [{ LIST: { a: { GROUPNAME: "A", SERVICES: [{ SERVICEID: 1, SERVICENAME: "x", CREDIT: 1 }] },
    b: { GROUPNAME: "B", SERVICES: [{ SERVICEID: "1", SERVICENAME: "y", CREDIT: 2 }] } } }] };
  const l = opcionesDe(doble);
  assert.equal(l.length, 1);
  assert.equal(l[0].grupo, "A");
});

test("lee el saldo del catálogo y de accountinfo (no se guarda el correo)", () => {
  assert.deepEqual(saldoDe(catalogo), { monto: 25.82, moneda: "USD", texto: "25.82 USD", cruda: { credit: "25.82 USD", creditraw: 25.82, currency: "USD" } });
  assert.ok(!JSON.stringify(saldoDe(catalogo)).includes("x@y.z"));
  const acc = { SUCCESS: [{ message: "Your Account Info", AccoutInfo: { credit: "12.5 USD", creditraw: "12.50", mail: "x@y.z", currency: "USD" } }], apiversion: "6.1" };
  assert.equal(saldoDe(acc).monto, 12.5);
  assert.equal(saldoDe(acc).texto, "12.5 USD");
  assert.deepEqual(saldoDe({ SUCCESS: [{ AccoutInfo: { credit: "3 EUR" } }] }), { monto: 3, moneda: "EUR", texto: "3 EUR", cruda: { credit: "3 EUR", creditraw: null, currency: "EUR" } });
  assert.deepEqual(saldoDe({ SUCCESS: [{ LIST: { g: { SERVICES: { 1: { SERVICEID: 1, SERVICENAME: "x", CREDIT: 9 } } } } }] }),
    { monto: null, moneda: null, texto: null, cruda: null });
  assert.equal(version(catalogo), "1.0");
});

test("los errores llegan con 200: se leen del cuerpo", () => {
  assert.equal(errorDe({ ERROR: [{ MESSAGE: "Authentication Failed" }], apiversion: "1.0" }), "Authentication Failed");
  assert.equal(errorDe({ ERROR: [{}] }), "error_sin_mensaje");
  assert.equal(errorDe(catalogo), null);
  assert.equal(errorDe([]), "respuesta_inesperada");
  assert.equal(errorDe({ algo: 1 }), "respuesta_inesperada");
  assert.equal(errorDe("texto"), "respuesta_inesperada");
});

test("números con formato del proveedor", () => {
  assert.equal(numero("1,234.50 USD"), 1234.5);
  assert.equal(numero(""), null);
  assert.equal(numero("USD"), null);
  assert.equal(numero(NaN), null);
});

test("la llave nunca queda en un mensaje guardado", () => {
  const llave = "abcd1234";
  assert.equal(tapar("Invalid key abcd1234 for user", llave), "Invalid key **** for user");
  assert.equal(tapar("token " + "A1".repeat(20), "zz"), "token ****");
  assert.ok(tapar("x".repeat(1000), "").length <= 300);
});

test("lee la cuenta que entrega el proveedor (S4.4) y no adivina", () => {
  assert.deepEqual(leerCuenta("User: abc123 | Pass: x9y8"), { usuario: "abc123", clave: "x9y8" });
  assert.deepEqual(leerCuenta("user:abc|pass:x"), { usuario: "abc", clave: "x" });
  assert.deepEqual(leerCuenta("USER: a.b@c.com\nPASS: P@ss!word"), { usuario: "a.b@c.com", clave: "P@ss!word" });
  assert.deepEqual(leerCuenta("Username = u1   Password = p1"), { usuario: "u1", clave: "p1" });
  assert.deepEqual(leerCuenta("User: u2<br>Pass: p&amp;2"), { usuario: "u2", clave: "p&2" });
  for (const malo of ["", null, "tu cuenta: ver correo", "User: | Pass: x", "User: a", "Pass: x | User: a",
                      "User: a | Pass: x\nUser: b | Pass: y", 42,
                      // auditoría 18-nov G2: el texto entero tiene que calzar
                      "User: abc, Pass: xyz", "User: abc | Pass: xyz.", "User: abc | Pass: x y", "User: <b>abc</b> | Pass: x",
                      "Hola! User: abc | Pass: x", "User: abc | Pass: x | 6 horas", "User: abc | Pass: xyz,6h"]) {
    assert.equal(leerCuenta(malo), null, String(malo));
  }
});

test("copia real guardada (opcional)", { skip: !process.env.PROVEEDOR_COPIA }, () => {
  const json = JSON.parse(readFileSync(process.env.PROVEEDOR_COPIA!, "utf8"));
  assert.equal(errorDe(json), null);
  const l = opcionesDe(json);
  assert.equal(l.length, 784);
  assert.equal(l.filter((o) => o.tipo === "REMOTE").length, 42);
  assert.ok(l.every((o) => o.numero_servicio && o.nombre && o.costo !== null));
  assert.ok(saldoDe(json).monto !== null);
});
