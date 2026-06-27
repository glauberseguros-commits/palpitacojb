// src/services/king/king.firestore.js
// Responsável exclusivamente por acesso ao Firestore.

import {
  getDocs,
  getDocsFromServer,
} from "firebase/firestore";

export const KING_FIRESTORE_MODULE_READY = true;

export async function safeGetDocsSmart(qRef, { policy = "cache" } = {}) {
  const p = String(policy || "cache").toLowerCase();

  if (p === "server") {
    try {
      const snap = await getDocsFromServer(qRef);
      return { snap, error: null, source: "server" };
    } catch (e) {
      try {
        const snap = await getDocs(qRef);
        return { snap, error: null, source: "cache_fallback" };
      } catch (e2) {
        return { snap: null, error: e2, source: "error" };
      }
    }
  }

  try {
    const snapCache = await getDocs(qRef);
    if (snapCache?.docs?.length) {
      return { snap: snapCache, error: null, source: "cache" };
    }

    try {
      const snapServer = await getDocsFromServer(qRef);
      return { snap: snapServer, error: null, source: "server_fallback" };
    } catch (_e2) {
      return { snap: snapCache, error: null, source: "cache_empty" };
    }
  } catch (_e) {
    try {
      const snap = await getDocsFromServer(qRef);
      return { snap, error: null, source: "server_after_cache_error" };
    } catch (e2) {
      return { snap: null, error: e2, source: "error" };
    }
  }
}
