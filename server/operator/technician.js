export const autoRevertSwapMs = 10_000;

function trimRedirectorId(value) {
  return String(value || "").trim().slice(0, 64);
}

export function eligibleTechnicians(db) {
  return (db.users || [])
    .filter((user) => user.active !== false && trimRedirectorId(user.technicianRedirectorId))
    .map((user) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      redirectorId: trimRedirectorId(user.technicianRedirectorId),
      role: user.role,
    }));
}

export function defaultActiveTechnician(db) {
  const eligible = eligibleTechnicians(db);
  if (!eligible.length) return null;
  const titular = eligible[0];
  return {
    userId: titular.userId,
    redirectorId: titular.redirectorId,
    switchedAt: new Date().toISOString(),
    swapInProgress: false,
    swapEndsAt: null,
    pendingUserId: null,
    pendingRedirectorId: null,
    autoRevertAt: null,
    autoRevertToUserId: null,
  };
}

function commitPendingSwap(state) {
  return {
    ...state,
    userId: state.pendingUserId,
    redirectorId: state.pendingRedirectorId,
    switchedAt: new Date().toISOString(),
    swapInProgress: false,
    swapEndsAt: null,
    pendingUserId: null,
    pendingRedirectorId: null,
  };
}

function startRevertSwap(state, db, swapMs) {
  const target = (db.users || []).find((user) => user.id === state.autoRevertToUserId);
  const targetRedirector = trimRedirectorId(target?.technicianRedirectorId);
  if (!target || !targetRedirector) {
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
    pendingUserId: target.id,
    pendingRedirectorId: targetRedirector,
    autoRevertAt: null,
    autoRevertToUserId: null,
    switchedAt: nowIso,
  };
}

export function resolveActiveTechnician(db, now, swapMs) {
  let state = db.activeTechnician;
  if (!state) {
    const next = defaultActiveTechnician(db);
    if (!next) return { state: null, changed: false };
    return { state: next, changed: true };
  }
  let changed = false;
  if (state.swapInProgress && state.swapEndsAt && now >= state.swapEndsAt) {
    state = commitPendingSwap(state);
    changed = true;
  }
  if (!state.swapInProgress && state.autoRevertAt && now >= state.autoRevertAt) {
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
  const activeUser = state ? (db.users || []).find((user) => user.id === state.userId) : null;
  const autoRevertUser = state?.autoRevertToUserId
    ? (db.users || []).find((user) => user.id === state.autoRevertToUserId)
    : null;
  const autoRevertSecondsLeft = state?.autoRevertAt ? Math.max(0, Math.ceil((state.autoRevertAt - now) / 1000)) : 0;
  return {
    active: state
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