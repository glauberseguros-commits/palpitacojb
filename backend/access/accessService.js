"use strict";

const {
  admin,
  getDb,
} = require("../service/firebaseAdmin");

const {
  ACCESS_PRODUCT,
  SUBSCRIPTION_STATUS,
  ACCESS_EVENT_TYPE,
} = require("./accessConfig");

function asMillis(value) {
  if (value == null) {
    return null;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value?.toMillis ===
    "function"
  ) {
    const ms = value.toMillis();

    return Number.isFinite(ms)
      ? ms
      : null;
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    const ms =
      value.toDate().getTime();

    return Number.isFinite(ms)
      ? ms
      : null;
  }

  if (typeof value === "string") {
    const ms =
      Date.parse(value);

    return Number.isFinite(ms)
      ? ms
      : null;
  }

  return null;
}

function isoOrNull(ms) {
  if (
    typeof ms !== "number" ||
    !Number.isFinite(ms)
  ) {
    return null;
  }

  return new Date(ms)
    .toISOString();
}

function normalizeStoredStatus(value) {
  const status =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    Object.values(
      SUBSCRIPTION_STATUS
    ).includes(status)
  ) {
    return status;
  }

  return SUBSCRIPTION_STATUS.PENDING;
}

function normalizeText(
  value,
  maxLength
) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

/**
 * operationId:
 *
 * - identifica UMA operação administrativa;
 * - é obrigatório;
 * - torna retries idempotentes;
 * - nunca contém "/" para poder ser usado
 *   como Firestore document id.
 */
function normalizeOperationId(value) {
  const id =
    String(value || "").trim();

  if (
    id.length < 8 ||
    id.length >
      ACCESS_PRODUCT
        .maxOperationIdLength
  ) {
    return "";
  }

  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/
      .test(id)
  ) {
    return "";
  }

  return id;
}

function computeSubscriptionState(
  accountData,
  nowMs = Date.now()
) {
  const data =
    accountData &&
    typeof accountData === "object"
      ? accountData
      : {};

  const subscription =
    data.subscription &&
    typeof data.subscription ===
      "object"
      ? data.subscription
      : {};

  const storedStatus =
    normalizeStoredStatus(
      subscription.status
    );

  const startedAtMs =
    asMillis(
      subscription.startedAt
    );

  const firstActivatedAtMs =
    asMillis(
      subscription.firstActivatedAt
    );

  const endsAtMs =
    asMillis(
      subscription.endsAt
    );

  const active =
    storedStatus ===
      SUBSCRIPTION_STATUS.ACTIVE &&
    typeof endsAtMs === "number" &&
    endsAtMs > nowMs;

  let effectiveStatus =
    storedStatus;

  if (
    storedStatus ===
      SUBSCRIPTION_STATUS.ACTIVE &&
    !active
  ) {
    effectiveStatus =
      SUBSCRIPTION_STATUS.EXPIRED;
  }

  return {
    schemaVersion:
      Number(data.schemaVersion) || 1,

    planCode:
      String(
        subscription.planCode ||
        ACCESS_PRODUCT.planCode
      ),

    priceCents:
      Number(
        subscription.priceCents
      ) ||
      ACCESS_PRODUCT.priceCents,

    currency:
      String(
        subscription.currency ||
        ACCESS_PRODUCT.currency
      ),

    durationDays:
      Number(
        subscription.durationDays
      ) ||
      ACCESS_PRODUCT.durationDays,

    status: effectiveStatus,
    active,

    grantCount:
      Number(
        subscription.grantCount
      ) || 0,

    startedAtMs,
    firstActivatedAtMs,
    endsAtMs,

    startedAt:
      isoOrNull(startedAtMs),

    firstActivatedAt:
      isoOrNull(
        firstActivatedAtMs
      ),

    endsAt:
      isoOrNull(endsAtMs),
  };
}


function normalizeSubscriptionDays(
  value
) {
  const days =
    Number(value);

  if (
    !Number.isSafeInteger(days) ||
    days < 1 ||
    days > 3650
  ) {
    const error =
      new Error(
        "INVALID_SUBSCRIPTION_DAYS"
      );

    error.code =
      "INVALID_SUBSCRIPTION_DAYS";

    throw error;
  }

  return days;
}


/**
 * Regra de renovação.
 *
 * ACTIVE:
 *   preserva o início do período vigente
 *   e soma 30 dias ao vencimento atual.
 *
 * NEW / EXPIRED / REVOKED:
 *   começa um novo período agora.
 */
function computeRenewalWindow(
  currentState,
  nowMs = Date.now(),
  durationDays =
    ACCESS_PRODUCT.durationDays
) {
  const safeDays =
    normalizeSubscriptionDays(
      durationDays
    );

  const current =
    currentState &&
    typeof currentState === "object"
      ? currentState
      : {};

  const active =
    current.active === true &&
    typeof current.endsAtMs ===
      "number" &&
    current.endsAtMs > nowMs;

  const baseMs =
    active
      ? current.endsAtMs
      : nowMs;

  const startedAtMs =
    active &&
    typeof current.startedAtMs ===
      "number"
      ? current.startedAtMs
      : nowMs;

  return {
    startedAtMs,

    previousEndsAtMs:
      typeof current.endsAtMs ===
        "number"
        ? current.endsAtMs
        : null,

    newEndsAtMs:
      baseMs +
      safeDays *
        24 * 60 * 60 * 1000,

    renewal:
      active,
  };
}

function accountRef(uid) {
  const safeUid =
    String(uid || "").trim();

  if (!safeUid) {
    throw new Error(
      "ACCESS_UID_REQUIRED"
    );
  }

  return getDb()
    .collection(
      ACCESS_PRODUCT
        .accountCollection
    )
    .doc(safeUid);
}

function eventRef(
  uid,
  operationId
) {
  const op =
    normalizeOperationId(
      operationId
    );

  if (!op) {
    throw new Error(
      "INVALID_OPERATION_ID"
    );
  }

  return accountRef(uid)
    .collection(
      ACCESS_PRODUCT
        .eventSubcollection
    )
    .doc(op);
}

async function getAccessSnapshot(uid) {
  const ref =
    accountRef(uid);

  const snap =
    await ref.get();

  if (!snap.exists) {
    return {
      uid: String(uid),
      exists: false,

      subscription:
        computeSubscriptionState(
          null
        ),

      accessGranted: false,
    };
  }

  const data =
    snap.data() || {};

  const subscription =
    computeSubscriptionState(
      data
    );

  return {
    uid: String(uid),
    exists: true,

    email:
      String(
        data.email || ""
      )
        .trim()
        .toLowerCase(),

    subscription,

    accessGranted:
      subscription.active === true,
  };
}

async function assertActiveSubscription(
  uid
) {
  const snapshot =
    await getAccessSnapshot(uid);

  if (!snapshot.accessGranted) {
    const error =
      new Error(
        "ACTIVE_SUBSCRIPTION_REQUIRED"
      );

    error.code =
      "ACTIVE_SUBSCRIPTION_REQUIRED";

    error.accessSnapshot =
      snapshot;

    throw error;
  }

  return snapshot;
}

/**
 * Ativação / renovação idempotente.
 *
 * operationId é gravado numa subcoleção
 * imutável de eventos.
 *
 * Repetir o mesmo operationId NÃO concede
 * mais 30 dias.
 */
async function activateSubscription({
  uid,
  email,
  actorUid,
  operationId,
  paymentReference = "",
  days =
    ACCESS_PRODUCT.durationDays,
  nowMs = Date.now(),
}) {
  const safeUid =
    String(uid || "").trim();

  const safeActorUid =
    String(actorUid || "").trim();

  const safeEmail =
    String(email || "")
      .trim()
      .toLowerCase();

  const op =
    normalizeOperationId(
      operationId
    );

  if (!safeUid) {
    throw new Error(
      "ACCESS_UID_REQUIRED"
    );
  }

  if (!safeActorUid) {
    throw new Error(
      "ADMIN_ACTOR_REQUIRED"
    );
  }

  if (!safeEmail) {
    throw new Error(
      "ACCESS_EMAIL_REQUIRED"
    );
  }

  if (!op) {
    throw new Error(
      "INVALID_OPERATION_ID"
    );
  }

  const safeDays =
    normalizeSubscriptionDays(
      days
    );

  const db =
    getDb();

  const ref =
    accountRef(safeUid);

  const historyRef =
    eventRef(
      safeUid,
      op
    );

  let idempotentReplay =
    false;

  await db.runTransaction(
    async (tx) => {
      const accountSnap =
        await tx.get(ref);

      const eventSnap =
        await tx.get(
          historyRef
        );

      if (eventSnap.exists) {
        const existing =
          eventSnap.data() || {};

        if (
          existing.type !==
          ACCESS_EVENT_TYPE.GRANT
        ) {
          const conflict =
            new Error(
              "OPERATION_ID_CONFLICT"
            );

          conflict.code =
            "OPERATION_ID_CONFLICT";

          throw conflict;
        }

        idempotentReplay = true;
        return;
      }

      const current =
        accountSnap.exists
          ? accountSnap.data() || {}
          : {};

      const currentState =
        computeSubscriptionState(
          current,
          nowMs
        );

      const window =
        computeRenewalWindow(
          currentState,
          nowMs,
          safeDays
        );

      const nowTs =
        admin.firestore.Timestamp
          .fromMillis(nowMs);

      const startedAtTs =
        admin.firestore.Timestamp
          .fromMillis(
            window.startedAtMs
          );

      const endsAtTs =
        admin.firestore.Timestamp
          .fromMillis(
            window.newEndsAtMs
          );

      const previousEndsAtTs =
        typeof window
          .previousEndsAtMs ===
          "number"
          ? admin.firestore
              .Timestamp
              .fromMillis(
                window
                  .previousEndsAtMs
              )
          : null;

      const existingFirstMs =
        currentState
          .firstActivatedAtMs;

      const firstActivatedAtTs =
        admin.firestore.Timestamp
          .fromMillis(
            typeof existingFirstMs ===
              "number"
              ? existingFirstMs
              : nowMs
          );

      const grantCount =
        Math.max(
          0,
          Number(
            currentState
              .grantCount
          ) || 0
        ) + 1;

      const paymentReferenceSafe =
        normalizeText(
          paymentReference,
          ACCESS_PRODUCT
            .maxPaymentReferenceLength
        );

      const accountUpdate = {
        schemaVersion:
          ACCESS_PRODUCT
            .schemaVersion,

        uid: safeUid,
        email: safeEmail,

        subscription: {
          status:
            SUBSCRIPTION_STATUS
              .ACTIVE,

          planCode:
            ACCESS_PRODUCT
              .planCode,

          priceCents:
            ACCESS_PRODUCT
              .priceCents,

          currency:
            ACCESS_PRODUCT
              .currency,

          durationDays:
            safeDays,

          startedAt:
            startedAtTs,

          firstActivatedAt:
            firstActivatedAtTs,

          endsAt:
            endsAtTs,

          lastGrantedAt:
            nowTs,

          lastGrantedBy:
            safeActorUid,

          grantCount,
        },

        lastPayment: {
          status: "confirmed",

          method:
            ACCESS_PRODUCT
              .paymentMethod,

          amountCents:
            ACCESS_PRODUCT
              .priceCents,

          currency:
            ACCESS_PRODUCT
              .currency,

          reference:
            paymentReferenceSafe,

          operationId:
            op,

          confirmedAt:
            nowTs,

          confirmedBy:
            safeActorUid,
        },

        updatedAt:
          nowTs,

        updatedBy:
          safeActorUid,
      };

      if (!accountSnap.exists) {
        accountUpdate.createdAt =
          nowTs;
      }

      const eventData = {
        schemaVersion:
          ACCESS_PRODUCT
            .schemaVersion,

        type:
          ACCESS_EVENT_TYPE
            .GRANT,

        operationId:
          op,

        uid:
          safeUid,

        email:
          safeEmail,

        actorUid:
          safeActorUid,

        durationDays:
          safeDays,

        payment: {
          method:
            ACCESS_PRODUCT
              .paymentMethod,

          amountCents:
            ACCESS_PRODUCT
              .priceCents,

          currency:
            ACCESS_PRODUCT
              .currency,

          reference:
            paymentReferenceSafe,
        },

        renewal:
          window.renewal === true,

        previousEndsAt:
          previousEndsAtTs,

        newEndsAt:
          endsAtTs,

        occurredAt:
          nowTs,
      };

      tx.set(
        ref,
        accountUpdate,
        { merge: true }
      );

      tx.set(
        historyRef,
        eventData
      );
    }
  );

  const access =
    await getAccessSnapshot(
      safeUid
    );

  return {
    ...access,
    operationId: op,
    idempotentReplay,
  };
}

async function revokeSubscription({
  uid,
  actorUid,
  operationId,
  reason = "",
  nowMs = Date.now(),
}) {
  const safeUid =
    String(uid || "").trim();

  const safeActorUid =
    String(actorUid || "").trim();

  const op =
    normalizeOperationId(
      operationId
    );

  if (!safeUid) {
    throw new Error(
      "ACCESS_UID_REQUIRED"
    );
  }

  if (!safeActorUid) {
    throw new Error(
      "ADMIN_ACTOR_REQUIRED"
    );
  }

  if (!op) {
    throw new Error(
      "INVALID_OPERATION_ID"
    );
  }

  const db =
    getDb();

  const ref =
    accountRef(
      safeUid
    );

  const historyRef =
    eventRef(
      safeUid,
      op
    );

  let idempotentReplay =
    false;

  await db.runTransaction(
    async (tx) => {
      const accountSnap =
        await tx.get(ref);

      const eventSnap =
        await tx.get(
          historyRef
        );

      if (eventSnap.exists) {
        const existing =
          eventSnap.data() || {};

        if (
          existing.type !==
          ACCESS_EVENT_TYPE
            .REVOKE
        ) {
          const conflict =
            new Error(
              "OPERATION_ID_CONFLICT"
            );

          conflict.code =
            "OPERATION_ID_CONFLICT";

          throw conflict;
        }

        idempotentReplay = true;
        return;
      }

      if (!accountSnap.exists) {
        const missing =
          new Error(
            "ACCESS_ACCOUNT_NOT_FOUND"
          );

        missing.code =
          "ACCESS_ACCOUNT_NOT_FOUND";

        throw missing;
      }

      const current =
        accountSnap.data() || {};

      const currentState =
        computeSubscriptionState(
          current,
          nowMs
        );

      const nowTs =
        admin.firestore.Timestamp
          .fromMillis(nowMs);

      const previousEndsAtTs =
        typeof currentState
          .endsAtMs === "number"
          ? admin.firestore
              .Timestamp
              .fromMillis(
                currentState
                  .endsAtMs
              )
          : null;

      const safeReason =
        normalizeText(
          reason,
          ACCESS_PRODUCT
            .maxReasonLength
        );

      tx.set(
        ref,
        {
          subscription: {
            status:
              SUBSCRIPTION_STATUS
                .REVOKED,

            planCode:
              ACCESS_PRODUCT
                .planCode,

            priceCents:
              ACCESS_PRODUCT
                .priceCents,

            currency:
              ACCESS_PRODUCT
                .currency,

            durationDays:
              ACCESS_PRODUCT
                .durationDays,

            endsAt:
              nowTs,

            revokedAt:
              nowTs,

            revokedBy:
              safeActorUid,

            revokeReason:
              safeReason,
          },

          updatedAt:
            nowTs,

          updatedBy:
            safeActorUid,
        },
        { merge: true }
      );

      tx.set(
        historyRef,
        {
          schemaVersion:
            ACCESS_PRODUCT
              .schemaVersion,

          type:
            ACCESS_EVENT_TYPE
              .REVOKE,

          operationId:
            op,

          uid:
            safeUid,

          actorUid:
            safeActorUid,

          reason:
            safeReason,

          previousEndsAt:
            previousEndsAtTs,

          occurredAt:
            nowTs,
        }
      );
    }
  );

  const access =
    await getAccessSnapshot(
      safeUid
    );

  return {
    ...access,
    operationId: op,
    idempotentReplay,
  };
}

module.exports = {
  asMillis,
  normalizeOperationId,
  computeSubscriptionState,
  normalizeSubscriptionDays,
  computeRenewalWindow,
  getAccessSnapshot,
  assertActiveSubscription,
  activateSubscription,
  revokeSubscription,
};
