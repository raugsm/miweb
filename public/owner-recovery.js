const form = document.querySelector("#form");
const message = document.querySelector("#message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  const body = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch("/api/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo restablecer.");
    message.textContent = payload.message;
    message.dataset.type = "success";
    form.reset();
  } catch (error) {
    message.textContent = error.message;
    message.dataset.type = "error";
  }
});
