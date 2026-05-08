export const countries = [
  { iso: "MX", name: "Mexico" },
  { iso: "PE", name: "Peru" },
  { iso: "CO", name: "Colombia" },
  { iso: "CL", name: "Chile" },
  { iso: "INTL", name: "Internacional" },
];

const countryNames = new Map(countries.map((country) => [country.iso, country.name]));

export function countryName(iso) {
  return countryNames.get(String(iso || "").toUpperCase()) || "Selecciona pais";
}

export function normalizeCountryIso(value) {
  const text = String(value || "").trim().toUpperCase();
  if (text === "GLOBAL" || text === "INTL") return "INTL";
  return /^[A-Z]{2}$/.test(text) ? text : "";
}
