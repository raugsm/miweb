import { createAuditEvent } from "../core/audit.js";
import { withTransaction } from "./postgres.js";
import { insertAuditEventWithClient } from "./postgres-audit.js";

const verifiedStatuses = new Set(["EMAIL_VERIFICADO", "VERIFICADO", "VIP", "EMPRESA"]);

function stringValue(value) {
  return value === undefined || value === null ? "" : String(value);
}

function isoOrEmpty(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function legacyObject(row) {
  return { ...jsonObject(row?.legacy_json) };
}

function timestampOrNull(value) {
  return value ? value : null;
}

function customerClientFromRow(row) {
  const legacy = legacyObject(row);
  return {
    ...legacy,
    id: stringValue(row.id || legacy.id),
    masterClientId: stringValue(row.master_client_id || legacy.masterClientId),
    name: stringValue(row.name || legacy.name),
    whatsapp: stringValue(row.whatsapp || legacy.whatsapp),
    country: stringValue(row.country || legacy.country),
    whatsappCountryIso: stringValue(row.whatsapp_country_iso || legacy.whatsappCountryIso),
    whatsappDetectedCountry: stringValue(row.whatsapp_detected_country || legacy.whatsappDetectedCountry),
    status: stringValue(row.status || legacy.status || "REGISTRADO_NO_VERIFICADO"),
    primaryEmail: stringValue(row.primary_email || legacy.primaryEmail || legacy.email),
    emailVerifiedAt: isoOrEmpty(row.email_verified_at) || stringValue(legacy.emailVerifiedAt),
    createdAt: isoOrEmpty(row.created_at) || stringValue(legacy.createdAt),
    updatedAt: isoOrEmpty(row.updated_at) || stringValue(legacy.updatedAt),
  };
}

function customerUserFromRow(row) {
  const legacy = legacyObject(row);
  return {
    ...legacy,
    id: stringValue(row.id || legacy.id),
    clientId: stringValue(row.client_id || legacy.clientId),
    name: stringValue(row.name || legacy.name),
    email: stringValue(row.email || legacy.email),
    passwordHash: stringValue(row.password_hash || legacy.passwordHash),
    role: stringValue(row.role || legacy.role || "OWNER"),
    active: row.active !== false,
    emailVerifiedAt: isoOrEmpty(row.email_verified_at) || stringValue(legacy.emailVerifiedAt),
    createdAt: isoOrEmpty(row.created_at) || stringValue(legacy.createdAt),
    updatedAt: isoOrEmpty(row.updated_at) || stringValue(legacy.updatedAt),
  };
}

export function applyPortalCustomerManualConfirmation({ client, users = [], tokenCount = 0, actorId, confirmedAt, reason = "" }) {
  if (!client) {
    return { ok: false, status: 404, error: "Cliente del portal no encontrado." };
  }
  const previousStatus = stringValue(client.status || "REGISTRADO_NO_VERIFICADO");
  if (previousStatus === "BLOQUEADO") {
    return { ok: false, status: 409, error: "Cliente bloqueado. No se puede confirmar manualmente." };
  }

  const newStatus = verifiedStatuses.has(previousStatus) ? previousStatus : "EMAIL_VERIFICADO";
  const nextClient = {
    ...client,
    status: newStatus,
    emailVerifiedAt: client.emailVerifiedAt || confirmedAt,
    updatedAt: confirmedAt,
  };
  const nextUsers = users.map((user) => ({
    ...user,
    emailVerifiedAt: user.emailVerifiedAt || confirmedAt,
    updatedAt: confirmedAt,
  }));
  return {
    ok: true,
    client: nextClient,
    users: nextUsers,
    auditDetail: {
      previousStatus,
      newStatus,
      userCount: nextUsers.length,
      consumedVerificationTokens: Number(tokenCount || 0),
      reason: stringValue(reason),
    },
    auditEvent: createAuditEvent(actorId, "PORTAL_CLIENT_MANUALLY_CONFIRMED", client.id, {
      previousStatus,
      newStatus,
      userCount: nextUsers.length,
      consumedVerificationTokens: Number(tokenCount || 0),
      reason: stringValue(reason),
    }),
  };
}

export async function confirmPortalCustomerPostgres({ clientId, actorId, confirmedAt, reason = "" }) {
  return withTransaction(async (client) => {
    const clientResult = await client.query(
      `
        select *
        from ariad.customer_clients
        where id = $1
        for update
      `,
      [clientId],
    );
    const clientRow = clientResult.rows[0] || null;
    const userResult = await client.query(
      `
        select *
        from ariad.customer_users
        where client_id = $1
        for update
      `,
      [clientId],
    );
    const tokenResult = await client.query(
      `
        select id, legacy_json
        from ariad.customer_email_verification_tokens
        where client_id = $1
          and used_at is null
        for update
      `,
      [clientId],
    );

    const result = applyPortalCustomerManualConfirmation({
      client: clientRow ? customerClientFromRow(clientRow) : null,
      users: userResult.rows.map(customerUserFromRow),
      tokenCount: tokenResult.rows.length,
      actorId,
      confirmedAt,
      reason,
    });
    if (!result.ok) return result;

    await client.query(
      `
        update ariad.customer_clients
        set status = $2,
            email_verified_at = coalesce(email_verified_at, $3),
            updated_at = $3,
            legacy_json = $4::jsonb
        where id = $1
      `,
      [
        result.client.id,
        result.client.status,
        timestampOrNull(confirmedAt),
        JSON.stringify(result.client),
      ],
    );

    for (const user of result.users) {
      await client.query(
        `
          update ariad.customer_users
          set email_verified_at = coalesce(email_verified_at, $2),
              updated_at = $2,
              legacy_json = $3::jsonb
          where id = $1
        `,
        [user.id, timestampOrNull(confirmedAt), JSON.stringify(user)],
      );
    }

    for (const token of tokenResult.rows) {
      const legacy = { ...legacyObject(token), usedAt: confirmedAt };
      await client.query(
        `
          update ariad.customer_email_verification_tokens
          set used_at = $2,
              legacy_json = $3::jsonb
          where id = $1
        `,
        [token.id, timestampOrNull(confirmedAt), JSON.stringify(legacy)],
      );
    }

    await insertAuditEventWithClient(client, result.auditEvent);
    return {
      ok: true,
      client: {
        id: result.client.id,
        name: result.client.name,
        status: result.client.status,
        emailVerifiedAt: result.client.emailVerifiedAt,
      },
      audit: result.auditDetail,
    };
  });
}
