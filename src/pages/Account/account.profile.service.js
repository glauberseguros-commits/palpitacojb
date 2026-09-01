import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

/**
 * Perfil do usuario.
 *
 * IMPORTANTE:
 * - users/{uid} guarda somente identidade/perfil;
 * - assinatura comercial NAO pertence a este documento;
 * - Trial NAO existe;
 * - plan/FREE/PREMIUM/VIP NAO sao autoridade de acesso;
 * - assinatura e validade pertencem ao backend autoritativo
 *   em access_accounts/{uid}.
 */

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhone(value) {
  return String(value || "")
    .replace(/\D+/g, "")
    .slice(0, 11);
}

/**
 * Garante users/{uid}.
 *
 * Usuario novo nasce apenas como usuario autenticado.
 * Nao recebe Trial e nao recebe plano comercial pelo client.
 */
export async function ensureUserDoc(
  db,
  uid,
  user
) {
  const u =
    normalizeText(uid);

  if (!u) {
    return {
      ok: false,
      created: false,
    };
  }

  try {
    const ref =
      doc(db, "users", u);

    const snap =
      await getDoc(ref);

    const now =
      nowIso();

    if (!snap.exists()) {
      const createdAt =
        user?.metadata?.creationTime
          ? new Date(
              user.metadata.creationTime
            ).toISOString()
          : now;

      await setDoc(
        ref,
        {
          email:
            normalizeEmail(user?.email),

          name:
            normalizeText(
              user?.displayName
            ),

          phone: "",
          phoneDigits: "",
          photoURL: "",

          createdAt,
          createdAtMs:
            Date.parse(createdAt) ||
            Date.now(),

          updatedAt: now,
          updatedAtMs: Date.now(),
          lastActiveAt: now,
        },
        { merge: false }
      );

      return {
        ok: true,
        created: true,
      };
    }

    const current =
      snap.data() || {};

    const patch = {
      updatedAt: now,
      updatedAtMs: Date.now(),
      lastActiveAt: now,
    };

    const authEmail =
      normalizeEmail(user?.email);

    if (
      authEmail &&
      normalizeEmail(current.email) !==
        authEmail
    ) {
      patch.email =
        authEmail;
    }

    if (
      !normalizeText(current.name) &&
      normalizeText(user?.displayName)
    ) {
      patch.name =
        normalizeText(
          user.displayName
        );
    }

    const phone =
      normalizePhone(
        current.phone ||
        current.phoneDigits
      );

    if (
      phone &&
      normalizePhone(
        current.phoneDigits
      ) !== phone
    ) {
      patch.phoneDigits =
        phone;
    }

    await setDoc(
      ref,
      patch,
      { merge: true }
    );

    return {
      ok: true,
      created: false,
    };
  }
  catch {
    return {
      ok: false,
      created: false,
    };
  }
}

/**
 * Carrega somente perfil.
 *
 * Nenhum campo comercial legado participa do retorno.
 */
export async function loadUserProfile(
  db,
  uid
) {
  const u =
    normalizeText(uid);

  if (!u) {
    return null;
  }

  try {
    const ref =
      doc(db, "users", u);

    const snap =
      await getDoc(ref);

    if (!snap.exists()) {
      return null;
    }

    const data =
      snap.data() || {};

    return {
      name:
        normalizeText(data.name),

      phone:
        normalizePhone(
          data.phone ||
          data.phoneDigits
        ),

      photoURL:
        normalizeText(
          data.photoURL ||
          data.photoUrl
        ),

      email:
        normalizeEmail(data.email),

      createdAt:
        normalizeText(data.createdAt),

      lastActiveAt:
        normalizeText(
          data.lastActiveAt
        ),
    };
  }
  catch {
    return null;
  }
}

/**
 * Atualiza somente dados de perfil.
 */
export async function saveUserProfile(
  db,
  uid,
  payload
) {
  const u =
    normalizeText(uid);

  if (!u) {
    return false;
  }

  try {
    const phoneDigits =
      normalizePhone(
        payload?.phone
      );

    const now =
      nowIso();

    const ref =
      doc(db, "users", u);

    await setDoc(
      ref,
      {
        name:
          normalizeText(
            payload?.name
          ),

        phone:
          phoneDigits,

        phoneDigits,

        photoURL:
          normalizeText(
            payload?.photoURL
          ),

        updatedAt:
          now,

        updatedAtMs:
          Date.now(),

        lastActiveAt:
          now,
      },
      { merge: true }
    );

    return true;
  }
  catch {
    return false;
  }
}