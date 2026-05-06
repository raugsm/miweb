import { api } from "./api.js";
import { $, setMessage } from "./dom.js";

export async function applyEmailVerification() {
  const params = new URLSearchParams(location.search);
  const token = params.get("verifyEmail");
  if (!token) return false;
  try {
    const payload = await api("/api/portal/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    setMessage($("#authMessage"), payload.message || "Correo verificado.", "success");
    history.replaceState({}, "", location.pathname);
    return true;
  } catch (error) {
    setMessage($("#authMessage"), error.message, "error");
    return false;
  }
}
