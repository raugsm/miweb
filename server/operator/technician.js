import { frpWorkChannel } from "../config/catalog.js";
import { normalizeWorkChannel } from "../core/validation.js";

export const autoRevertSwapMs = 10_000;

const technicianRole = "ATENCION_TECNICA";

export function normalizeTechnicianRedirectorId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[\d\s]+$/.test(raw)) return "";
  const compact = raw.replace(/\s+/g, "");
  if (!/^\d{12}$/.test(compact)) return "";
  return compact.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export function isFrpTechnicianEligible(user) {
  return Boolean(
    user
    && user.active !== false
    && user.role === technicianRole
    && normalizeWorkChannel(user.workChannel) === frpWorkChannel
    && normalizeTechnicianRedirectorId(user.technicianRedirectorId),
  );
}

export function eligibleTechnicians(db) {
  return (db.users || [])
    .filter(isFrpTechnicianEligible)
    .map((user) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      redirectorId: normalizeTechnicianRedirectorId(user.technicianRedirectorId),
      role: user.role,
      workChannel: normalizeWorkChannel(user.workChannel),
    }));
}

function activeStateFromCandidate(candidate, now, previous = {}) {
  return {
    userId: candidate.userId,
    redirectorId: candidate.redirectorId,
    switchedAt: previous.switchedAt || new Date(now).toISOString(),
    swapInProgress: false,
    swapEndsAt: null,
    pendingUserId: null,
    pendingRedirectorId: null,
    autoRevertAt: previous.autoRevertAt || null,
    autoRevertToUserId: previous.autoRevertToUserId || null,
  };
}

export function defaultActiveTechnician(db, now = Date.now()) {
  const eligible = eligibleTechnicians(db);
  if (!eligible.length) return null;
  const titular = eligible[0];
  return activeStateFromCandidate(titular, now);
}

function commitPendingSwap(state, db, now) {
  const target = eligibleTechnicians(db).find((candidate) => candidate.userId === state.pendingUserId);
  if (!target) return defaultActiveTechnician(db, now);
  return {
    ...state,
    userId: target.userId,
    redirectorId: target.redirectorId,
    switchedAt: new Date(now).toISOString(),
    swapInProgress: false,
    swapEndsAt: null,
    pendingUserId: null,
    pendingRedirectorId: null,
  };
}

function startRevertSwap(state, db, swapMs) {
  const target = eligibleTechnicians(db).find((candidate) => candidate.userId === state.autoRevertToUserId);
  if (!target) {
    return {
      ...state,
      autoRevertAt: null,
      autoRevertToUserId: null,
    };
  }
  const nowIso = new Date().toISOString();
  return {
    ...state,
    swapInProgress: true,
    swapEndsAt: Date.now() + swapMs,
    pendingUserId: target.userId,
    pendingRedirectorId: target.redirectorId,
    autoRevertAt: null,
    autoRevertToUserId: null,
    switchedAt: nowIso,
  };
}

export function resolveActiveTechnician(db, now, swapMs) {
  let state = db.activeTechnician;
  if (!state) {
    const next = defaultActiveTechnician(db, now);
    if (!next) return { state: null, changed: false };
    return { state: next, changed: true };
  }
  let changed = false;
  let eligible = eligibleTechnicians(db);
  if (state.swapInProgress && state.swapEndsAt && now >= state.swapEndsAt) {
    state = commitPendingSwap(state, db, now);
    changed = true;
    eligible = eligibleTechnicians(db);
  }
  if (state?.swapInProgress) {
    const current = eligible.find((candidate) => candidate.userId === state.userId);
    const pending = eligible.find((candidate) => candidate.userId === state.pendingUserId);
    if (!current || !pending) {
      state = current ? activeStateFromCandidate(current, now, state) : defaultActiveTechnician(db, now);
      changed = true;
    } else if (state.pendingRedirectorId !== pending.redirectorId || state.redirectorId !== current.redirectorId) {
      state = {
        ...state,
        redirectorId: current.redirectorId,
        pendingRedirectorId: pending.redirectorId,
      };
      changed = true;
    }
  }
  if (state && !state.swapInProgress) {
    const current = eligible.find((candidate) => candidate.userId === state.userId);
    if (!current) {
      state = defaultActiveTechnician(db, now);
      changed = true;
    } else if (state.redirectorId !== current.redirectorId) {
      state = activeStateFromCandidate(current, now, state);
      changed = true;
    }
  }
  if (state && !state.swapInProgress && state.autoRevertAt && now >= state.autoRevertAt) {
    state = startRevertSwap(state, db, swapMs);
    changed = true;
  }
  return { state, changed };
}

export function publicActiveTechnician(state, now) {
  if (!state) return { redirectorId: null, swapInProgress: false, swapSecondsLeft: 0 };
  if (state.swapInProgress && state.swapEndsAt) {
    const msLeft = Math.max(0, state.swapEndsAt - now);
    return {
      redirectorId: null,
      swapInProgress: true,
      swapSecondsLeft: Math.ceil(msLeft / 1000),
    };
  }
  return {
    redirectorId: state.redirectorId || null,
    swapInProgress: false,
    swapSecondsLeft: 0,
  };
}

export function operatorTechnicianStatus(db, state, now) {
  const eligible = eligibleTechnicians(db);
  const activeUser = state ? eligible.find((candidate) => candidate.userId === state.userId) : null;
  const autoRevertUser = state?.autoRevertToUserId ? eligible.find((candidate) => candidate.userId === state.autoRevertToUserId) : null;
  const autoRevertSecondsLeft = state?.autoRevertAt ? Math.max(0, Math.ceil((state.autoRevertAt - now) / 1000)) : 0;
  return {
    active: state && activeUser
      ? {
          userId: state.userId,
          name: activeUser?.name || "",
          redirectorId: state.redirectorId,
          switchedAt: state.switchedAt,
        }
      : null,
    eligible,
    swap: {
      inProgress: Boolean(state?.swapInProgress),
      secondsLeft: state?.swapEndsAt ? Math.max(0, Math.ceil((state.swapEndsAt - now) / 1000)) : 0,
      pendingUserId: state?.pendingUserId || null,
      pendingRedirectorId: state?.pendingRedirectorId || null,
    },
    autoRevert: state?.autoRevertAt
      ? {
          atIso: new Date(state.autoRevertAt).toISOString(),
          secondsLeft: autoRevertSecondsLeft,
          toUserId: state.autoRevertToUserId,
          toName: autoRevertUser?.name || "",
        }
      : null,
  };
}

export function isActiveFrpTechnician(db, user) {
  if (!user || !db.activeTechnician || db.activeTechnician.swapInProgress) return false;
  return eligibleTechnicians(db).some((candidate) => candidate.userId === user.id && candidate.userId === db.activeTechnician.userId);
}

export function applySwitch(db, { actor, targetUserId, durationMinutes, now, swapMs }) {
  const eligible = eligibleTechnicians(db);
  const target = eligible.find((candidate) => candidate.userId === targetUserId);
  if (!target) {
    return { ok: false, status: 400, error: "Tecnico destino no es elegible." };
  }
  const current = db.activeTechnician;
  const isAdmin = actor?.role === "ADMIN";
  const isCurrentActive = current && actor?.id && current.userId === actor.id;
  if (!isAdmin && !isCurrentActive) {
    return { ok: false, status: 403, error: "Solo el administrador o el tecnico activo pueden cambiar el turno." };
  }
  if (current?.swapInProgress) {
    return { ok: false, status: 409, error: "Hay un cambio en progreso. Intenta en unos segundos." };
  }
  if (current && current.userId === targetUserId && !current.autoRevertAt) {
    return { ok: false, status: 409, error: "Ese tecnico ya esta activo." };
  }
  const previousUserId = current?.userId || null;
  const minutes = Number(durationMinutes);
  const useAutoRevert = Number.isFinite(minutes) && minutes > 0;
  const swapEndsAt = now + swapMs;
  const nextState = {
    userId: current?.userId || target.userId,
    redirectorId: current?.redirectorId || target.redirectorId,
    switchedAt: current?.switchedAt || new Date(now).toISOString(),
    swapInProgress: true,
    swapEndsAt,
    pendingUserId: target.userId,
    pendingRedirectorId: target.redirectorId,
    autoRevertAt: useAutoRevert && previousUserId && previousUserId !== target.userId
      ? swapEndsAt + minutes * 60_000
      : null,
    autoRevertToUserId: useAutoRevert && previousUserId && previousUserId !== target.userId
      ? previousUserId
      : null,
  };
  return { ok: true, state: nextState, target, previousUserId };
}
