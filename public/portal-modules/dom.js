export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function setMessage(node, text, type = "") {
  if (!node) return;
  node.textContent = text || "";
  node.dataset.type = type;
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function copyText(text, messageNode) {
  const done = () => setMessage(messageNode, "Copiado. Ya puedes pegarlo.", "success");
  const fail = () => setMessage(messageNode, "No se pudo copiar automaticamente.", "error");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fail);
    return;
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  document.body.appendChild(helper);
  helper.select();
  try {
    document.execCommand("copy");
    done();
  } catch {
    fail();
  } finally {
    helper.remove();
  }
}
