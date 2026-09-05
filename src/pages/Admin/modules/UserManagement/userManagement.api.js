import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "../../../../services/firebase";

import {
  activateAdminUserAccess,
  adjustAdminUserValidity,
  deleteAdminUserAccount,
  getAccessProduct,
  getAdminUserAccess,
  revokeAdminUserAccess,
} from "../../../../services/accessClient";


function clean(value) {
  return String(value ?? "").trim();
}


function normalizeUserSnapshot(snapshot) {
  const data =
    snapshot.data() || {};

  return {
    uid:
      snapshot.id,

    email:
      clean(data.email),

    name:
      clean(data.name),

    phone:
      clean(data.phone),

    photoURL:
      clean(data.photoURL),

    createdAt:
      data.createdAt ?? null,

    updatedAt:
      data.updatedAt ?? null,

    lastActiveAt:
      data.lastActiveAt ?? null,
  };
}


function sortUsers(users) {
  return [...users].sort(
    (a, b) => {
      const aName =
        clean(a.name) ||
        clean(a.email) ||
        clean(a.uid);

      const bName =
        clean(b.name) ||
        clean(b.email) ||
        clean(b.uid);

      return aName.localeCompare(
        bName,
        "pt-BR",
        {
          sensitivity:
            "base",
        }
      );
    }
  );
}


export async function listUsers() {
  const snapshot =
    await getDocs(
      collection(
        db,
        "users"
      )
    );

  return sortUsers(
    snapshot.docs.map(
      normalizeUserSnapshot
    )
  );
}


export async function getUserAccess(
  uid
) {
  const response =
    await getAdminUserAccess(
      uid
    );

  return {
    user:
      response?.user || null,

    access:
      response?.access || null,
  };
}


export async function getAccessProductContract() {
  const response =
    await getAccessProduct();

  return (
    response?.product ||
    null
  );
}


export async function activateUserAccess(
  uid,
  {
    operationId,
    paymentReference,
    days = 30,
  } = {}
) {
  return activateAdminUserAccess({
    uid,
    operationId,
    paymentReference,
    days,
  });
}



export async function adjustUserValidity(
  uid,
  {
    operationId,
    validUntilYmd,
  } = {}
) {
  return adjustAdminUserValidity({
    uid,
    operationId,
    validUntilYmd,
  });
}


export async function revokeUserAccess(
  uid,
  {
    operationId,
    reason,
  } = {}
) {
  return revokeAdminUserAccess({
    uid,
    operationId,
    reason,
  });
}


export async function deleteUserAccount(
  uid
) {
  return deleteAdminUserAccount({
    uid,
  });
}


function randomToken() {
  try {
    if (
      typeof window !== "undefined" &&
      window.crypto
    ) {
      if (
        typeof window.crypto.randomUUID ===
        "function"
      ) {
        return window.crypto
          .randomUUID()
          .replace(/-/g, "");
      }

      if (
        typeof window.crypto
          .getRandomValues ===
        "function"
      ) {
        const bytes =
          new Uint8Array(12);

        window.crypto
          .getRandomValues(bytes);

        return Array.from(bytes)
          .map((value) =>
            value
              .toString(16)
              .padStart(2, "0")
          )
          .join("");
      }
    }
  } catch {}

  return String(
    Date.now()
  );
}


export function createAdminOperationId(
  kind,
  uid
) {
  const safeKind =
    clean(kind)
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]+/g,
        "-"
      ) ||
    "access";

  const safeUid =
    clean(uid)
      .replace(
        /[^A-Za-z0-9._:-]+/g,
        "-"
      )
      .slice(0, 40) ||
    "user";

  return (
    `${safeKind}:${safeUid}:${Date.now()}:${randomToken()}`
  ).slice(0, 128);
}
