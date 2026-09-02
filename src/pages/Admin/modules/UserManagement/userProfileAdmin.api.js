import {
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import {
  db,
} from "../../../../services/firebase";

function clean(value) {
  return String(value ?? "").trim();
}

function phoneDigits(value) {
  return String(value ?? "")
    .replace(/\D+/g, "")
    .slice(0, 11);
}

function formatPhone(value) {
  const digits =
    phoneDigits(value);

  if (digits.length === 11) {
    return (
      `(${digits.slice(0, 2)}) ` +
      `${digits.slice(2, 7)}-` +
      `${digits.slice(7)}`
    );
  }

  if (digits.length === 10) {
    return (
      `(${digits.slice(0, 2)}) ` +
      `${digits.slice(2, 6)}-` +
      `${digits.slice(6)}`
    );
  }

  return digits;
}

export async function updateAdminUserProfile(
  uid,
  {
    name,
    phone,
  } = {}
) {
  const safeUid =
    clean(uid);

  const safeName =
    clean(name);

  const digits =
    phoneDigits(phone);

  if (!safeUid) {
    throw new Error(
      "UID_REQUIRED"
    );
  }

  if (safeName.length < 2) {
    throw new Error(
      "Informe o nome do usuário."
    );
  }

  if (
    digits.length !== 10 &&
    digits.length !== 11
  ) {
    throw new Error(
      "Informe um telefone válido."
    );
  }

  const formattedPhone =
    formatPhone(digits);

  await updateDoc(
    doc(
      db,
      "users",
      safeUid
    ),
    {
      name:
        safeName,

      phone:
        formattedPhone,

      phoneDigits:
        digits,

      updatedAt:
        serverTimestamp(),
    }
  );

  return {
    uid:
      safeUid,

    name:
      safeName,

    phone:
      formattedPhone,

    phoneDigits:
      digits,
  };
}