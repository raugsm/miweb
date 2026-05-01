import { countries, countryByFlagIso, workChannels } from "../config/catalog.js";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function cleanName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

export function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

export function validateOperatorPin(pin) {
  return /^[0-9]{4,8}$/.test(String(pin || ""));
}

export function normalizeWorkChannel(value) {
  const channel = cleanText(value, 40);
  return workChannels.includes(channel) ? channel : "";
}

export function cleanText(value, max = 120) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function flagIsoFromRegionalIndicators(value) {
  const chars = Array.from(String(value || ""));
  for (let index = 0; index < chars.length - 1; index += 1) {
    const first = chars[index].codePointAt(0);
    const second = chars[index + 1].codePointAt(0);
    const isFlagPair = first >= 0x1f1e6 && first <= 0x1f1ff && second >= 0x1f1e6 && second <= 0x1f1ff;
    if (isFlagPair) {
      return String.fromCharCode(65 + first - 0x1f1e6, 65 + second - 0x1f1e6);
    }
  }
  return "";
}

export function countryFromFlag(value) {
  return countryByFlagIso[flagIsoFromRegionalIndicators(value)] || "";
}

export function stripCountryFlags(value) {
  return Array.from(String(value || ""))
    .filter((char) => {
      const code = char.codePointAt(0);
      return code < 0x1f1e6 || code > 0x1f1ff;
    })
    .join("");
}

export function normalizeForMatch(value) {
  return cleanText(stripCountryFlags(value), 180)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
