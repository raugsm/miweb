import { frpEligibilityCatalog, frpEligibilityStates } from "../config/catalog.js";
import { cleanText, normalizeForMatch } from "../core/validation.js";

export function normalizeFrpEligibilityText(value) {
  const spaced = normalizeForMatch(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    spaced,
    compact: spaced.replace(/\s+/g, ""),
    tokens: spaced ? spaced.split(" ") : [],
  };
}

export function frpAliasMatches(textIndex, alias) {
  const aliasIndex = normalizeFrpEligibilityText(alias);
  if (!aliasIndex.spaced) return false;
  if (/^[a-z0-9]{7,}$/i.test(aliasIndex.compact) && textIndex.compact.includes(aliasIndex.compact)) return true;
  const pattern = new RegExp(`(^|\\s)${aliasIndex.spaced.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
  return pattern.test(textIndex.spaced);
}

export function frpEquipmentLooksAmbiguous(textIndex, rawText) {
  if (!rawText) return true;
  const generic = new Set(["xiaomi", "redmi", "poco", "mi", "equipo", "telefono", "celular", "modelo", "frp"]);
  const usefulTokens = textIndex.tokens.filter((token) => !generic.has(token) && !/^\d{14,16}$/.test(token));
  if (!usefulTokens.length) return true;
  if (usefulTokens.length === 1 && usefulTokens[0].length < 3) return true;
  return false;
}

export function frpEligibilityResult(rawText) {
  const originalText = cleanText(rawText, 180);
  const textIndex = normalizeFrpEligibilityText(originalText);
  if (frpEquipmentLooksAmbiguous(textIndex, originalText)) {
    return {
      originalText,
      detectedMatch: "",
      matchedAlias: "",
      status: "REQUIERE_REVISION",
      internalReason: "Entrada ambigua o insuficiente para validar compatibilidad FRP Express.",
      publicMessage: "Necesitamos revisar este equipo antes de continuar con el pago.",
    };
  }
  for (const entry of frpEligibilityCatalog) {
    const matchedAlias = entry.aliases.find((alias) => frpAliasMatches(textIndex, alias));
    if (matchedAlias) {
      return {
        originalText,
        detectedMatch: entry.publicName,
        matchedAlias,
        status: frpEligibilityStates.has(entry.status) ? entry.status : "REQUIERE_REVISION",
        internalReason: entry.internalReason,
        publicMessage: entry.publicMessage,
      };
    }
  }
  return {
    originalText,
    detectedMatch: originalText,
    matchedAlias: "",
    status: "APTO_EXPRESS",
    internalReason: "Sin coincidencia en catalogo de bloqueos; se asume apto para FRP Express.",
    publicMessage: "Equipo apto para FRP Express.",
  };
}

export function summarizeFrpEligibility(items) {
  const results = items.map((item) => item.eligibility || frpEligibilityResult(item.originalText || item.model || ""));
  return {
    results,
    blocked: results.filter((result) => ["NO_APTO_MODO", "NO_APTO_HERRAMIENTA"].includes(result.status)),
    review: results.filter((result) => result.status === "REQUIERE_REVISION"),
  };
}
