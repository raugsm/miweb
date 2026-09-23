// Acceso del cliente al portal FRP: ingreso y registro.
// Port de `public/portal-modules/auth-forms.js` (parte de acceso).

import { useState, type FormEvent } from "react";

import { Panel } from "@/components/Panel";
import * as gsmApi from "@/lib/gsm/api";
import { usePortal } from "@/lib/gsm/portal-context";
import { cn } from "@/lib/utils";

type Tab = "login" | "register";

const inputClass =
  "h-10 w-full rounded-lg border border-line bg-field px-3 text-sm text-foreground outline-none transition-colors focus:border-cobalt";
const labelClass = "flex flex-col gap-1.5 text-xs text-muted-foreground";

export function PortalAuth() {
  const { catalog, reloadSession } = usePortal();
  const [tab, setTab] = useState<Tab>("login");
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    try {
      await gsmApi.login(String(form.get("email") || ""), String(form.get("password") || ""));
      await reloadSession();
    } catch (error) {
      setMessage({ text: (error as Error).message, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    try {
      const payload = await gsmApi.register({
        name: String(form.get("name") || ""),
        email: String(form.get("email") || ""),
        password: String(form.get("password") || ""),
        whatsapp: String(form.get("whatsapp") || ""),
        country: String(form.get("country") || ""),
      });
      setMessage({
        text: payload.message || "Cuenta creada. Revisá tu correo para verificarla.",
        type: "success",
      });
      await reloadSession();
    } catch (error) {
      setMessage({ text: (error as Error).message, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="mx-auto w-full max-w-md p-6">
      <div className="mb-5 flex gap-1 rounded-lg bg-field p-1">
        {(["login", "register"] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTab(value);
              setMessage(null);
            }}
            className={cn(
              "flex-1 rounded-md py-2 text-xs font-semibold transition-colors",
              tab === value ? "bg-cobalt text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "login" ? "Ingresar" : "Registro"}
          </button>
        ))}
      </div>

      {tab === "login" ? (
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <label className={labelClass}>
            Correo
            <input name="email" type="email" autoComplete="email" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-1 h-10 rounded-lg bg-cobalt text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegister} className="flex flex-col gap-3">
          <label className={labelClass}>
            Nombre y apellido
            <input name="name" autoComplete="name" maxLength={90} required className={inputClass} />
          </label>
          <label className={labelClass}>
            Correo
            <input name="email" type="email" autoComplete="email" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            WhatsApp
            <input
              name="whatsapp"
              type="tel"
              inputMode="tel"
              placeholder="+573001234567"
              required
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            País
            <select name="country" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Elegí tu país
              </option>
              {(catalog?.countries || []).map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-1 h-10 rounded-lg bg-cobalt text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Creando…" : "Crear cuenta cliente"}
          </button>
        </form>
      )}

      {message ? (
        <p
          aria-live="polite"
          className={cn(
            "mt-4 rounded-lg px-3 py-2 text-[11px]",
            message.type === "error"
              ? "bg-red-500/10 text-red-600 dark:text-red-300"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </Panel>
  );
}
