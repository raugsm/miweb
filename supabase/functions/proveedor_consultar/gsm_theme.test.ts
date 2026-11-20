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
  for (const malo of ["", null, "tu cuenta: ver correo", "User: | Pass: x", "User: a",
                      "User: a | Pass: x\nUser: b | Pass: y", 42,
                      // auditoría 18-nov G2: nunca un valor con un signo de más
                      "User: abc | Pass: xyz.", "User: abc | Pass: x y", "User: abc | Pass: xyz,6h"]) {
    assert.equal(leerCuenta(malo), null, String(malo));
  }
});

test("lee los otros formatos del proveedor por etiquetas (20-nov, AT-261120-043)", () => {
  const bien: [string, string, string][] = [
    // forma real de Moto King (valores inventados)
    ["Rental account active | Login: rent-a1b2c3@ejemplo.com | Password: Xy12ab34 | Expires: 2026-11-21 16:15 UTC | Desktop app only (no web panel).",
      "rent-a1b2c3@ejemplo.com", "Xy12ab34"],
    ["Pass: x | User: a", "a", "x"],
    ["User: abc, Pass: xyz", "abc", "xyz"],
    ["User: abc; Pass: xyz", "abc", "xyz"],
    ["User: <b>abc</b> | Pass: x", "abc", "x"],
    ["<b>Username:</b> u3<br><b>Password:</b> p3<br>Valid: 6 hours", "u3", "p3"],
    ["<p>Username: u3</p><p>Password: p3</p>", "u3", "p3"],
    ["Email: m@x.io\nPassword: p4\nServer: 2", "m@x.io", "p4"],
    ["Login: l5 Password: p5 Expires: 2026-11-21 16:15 UTC", "l5", "p5"],
    ["✅ Order completed!\n👤 Username: u6\n🔑 Password: p6\n⏰ Time left: 6 hours", "u6", "p6"],
    ["Email: acc7@x.com / Password: p7", "acc7@x.com", "p7"],
    ["Usuario: u9 | Contraseña: p9", "u9", "p9"],
    ["User/Email: u10@x.com - Pwd: p10", "u10@x.com", "p10"],
    ["E-mail: e11@x.com\r\nPassword: 'p11'", "e11@x.com", "p11"],
    ["Account type: Premium | Login: u12 | Password: p12 | Note: desktop app only", "u12", "p12"],
    ["Order ID: 3815 | Login ID: u13 | Password: p13", "u13", "p13"],
    ["Username：u14\tPassword：p14", "u14", "p14"],
    ["User: abc123 | Pass: Abc123!", "abc123", "Abc123!"],
    ["User: abc123 | Pass: a(b)c", "abc123", "a(b)c"],
  ];
  for (const [t, usuario, clave] of bien) assert.deepEqual(leerCuenta(t), { usuario, clave }, t);
  for (const malo of [
    "Login: a | PIN: 1234 | Password: x",                 // un dato más que el taller puede necesitar
    "Activation key: K-1 | User: a | Pass: x",
    "Your password: x | User: a",                          // una palabra suelta delante de la etiqueta
    "Server password: z | User: a | Password: y",
    "Old password: x",
    "User: a | Password: -",                               // sin letras ni números
    "Login: a | Email: b@c.com",                           // sin clave
    "Login: a | Login: b | Password: x",                   // dos usuarios distintos
    "User: a | Pass: x | Pass: y",
    "a@b.com:pass123", "a@b.com | pass123", "a@b.com / pass123",   // sin etiquetas
    "User: a | Pass: x<script>",                           // HTML que no es de formato
    "User: a | Pass: x&lt;y",
    "Login time: 6h | User: a | Pass: x",                  // etiqueta con «login» que no es el usuario
    "AnyDesk: 123 456 789 | User: a | Pass: x",
    // revisión adversarial del 20-nov: nada que sobre puede quedar pegado ni perderse
    "Hola! User: abc | Pass: x", "User: abc | Pass: x | 6 horas", "Login: l8 | Email: e8@x.com | Password: p8",
    "User: “abc123” | Pass: “Xy12ab34”", "User: abc123 | Pass: *Xy12ab34*", "(User: abc123 | Pass: Xy12ab34)",
    "[User: abc123]\n[Pass: Xy12ab34]", "User: abc123 | Pass: Xy12ab…", "Username: abc123，\nPassword: Xy12ab34。",
    "User: abc123 | Pass: Xy12​ab34", "User: abc123 | Pass: Xy12ab34✅", "User: abc123 | Pass: 'Xy12ab34'!",
    "Email: mailto:a@x.com | Password: Xy12ab34", "User: abc123 | Pass: Kx9|@#$", "User: abc123 | Pass: Kx9|Ab!",
    "User: abc123 | Pass: Xy12ab34 | 2FA: 482913", "User: abc123 | Pass: Xy12ab34 | PIN (if asked): 1234",
    "User: abc123 | Pass: Xy12ab34 | PIN 1234", "User: abc123 | Pass: Xy12ab34 | Key #1: ABCD-EFGH",
    "User: abc123 | Pass: Xy12ab34 | User 2: def456 | Pass 2: Qq77", "User: abc123 | Pass: Xy12ab34 | Note: PIN: 1234",
    "User: abc123 | Pass: Xy12ab34 | Expires: 2026-11-21 16:15 UTC PIN: 1234", "User: abc123 | Pass: Xy12ab34 | Tool code: 5521",
    "User ID: 7781 | Email: real@x.com | Password: Xy12ab34", "Login: https://unlocktool.net/login | Password: Xy12ab34",
    "Email: real@x.com | Password: Xy12ab34 | Support: Telegram user: @gsmhelp",
    "Account: acc7 | Password: p7 | For help email: support@prov.com", "Login: abc123 | One time password: 482913",
    "Login: real@x.com | Email account password: Ep1x | Password: Xy12ab34", "ID: user77 | Email: contact@x.com | Password: Xy12ab34",
    "Account: Premium | Username (email): real@x.com | Password: Xy12ab34",
    "User: abc123 | Pass: pending", "User: abc123 | Pass: N/A", "User: abc123 | Pass: xxxxxxxx", "User: abc123 | Pass: hidden",
    "User: abc123 | Pass: a&amp;amp;quot;b", 'User: abc123 | Pass: Xy12<span style="display:none">99</span>ab34',
    // verificación del OpenCode, 20-nov
    "Account: Premium | Password: Xy12ab34", "User: abc123 | Pass: Xy12ab34 | Note: backup abc999 Zz998877",
  ]) assert.equal(leerCuenta(malo), null, malo);
});

test("un texto enorme no traba la vuelta", () => {
  const t0 = Date.now();
  assert.equal(leerCuenta(" ".repeat(100_000) + "User: a | Pass: x"), null);
  assert.deepEqual(leerCuenta("User: a" + " ".repeat(1900) + "| Pass: x"), { usuario: "a", clave: "x" });
  assert.ok(Date.now() - t0 < 200);
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
