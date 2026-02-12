// src/pages/Account/account.hooks.js

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { buildAccountUI } from "./account.ui";
import {
  computeInitials,
  formatBRDateTime,
  formatPhoneBR,
  normalizePhoneDigits,
  diffDaysCeil,
} from "./account.formatters";

/**
 * Hook: viewport width (responsivo)
 */
export function useViewportWidth() {
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onResize = () => setVw(window.innerWidth || 1200);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return vw;
}

/**
 * Hook: UI tokens (memo)
 */
export function useAccountUI(vw) {
  return useMemo(() => buildAccountUI({ vw }), [vw]);
}

/**
 * Hook: preview de foto (ObjectURL) com cleanup
 */
export function usePhotoPreview() {
  const previewUrlRef = useRef("");

  const [photoPreview, setPhotoPreview] = useState("");

  const clearPreview = useCallback(() => {
    try {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    } catch {}
    previewUrlRef.current = "";
    setPhotoPreview("");
  }, []);

  const setPreviewFromFile = useCallback(
    async (file) => {
      clearPreview();
      if (!file) return;
      try {
        const url = URL.createObjectURL(file);
        previewUrlRef.current = url;
        setPhotoPreview(url);
      } catch {
        // se falhar, apenas não mostra preview
        previewUrlRef.current = "";
        setPhotoPreview("");
      }
    },
    [clearPreview]
  );

  useEffect(() => {
    return () => {
      clearPreview();
    };
  }, [clearPreview]);

  return { photoPreview, setPreviewFromFile, clearPreview };
}

/**
 * Hook: derivados para a UI (labels, flags, etc.)
 */
export function useAccountDerived({
  isGuest,
  uid,
  email,
  createdAtIso,
  trialStartAt,
  trialEndAt,
  trialActive,
  nameDraft,
  phoneDraft,
  photoURL,
  photoPreview,
}) {
  const isLogged = useMemo(() => !!String(uid || "").trim() && !isGuest, [uid, isGuest]);

  const initials = useMemo(() => computeInitials(nameDraft), [nameDraft]);

  const needsProfile = useMemo(() => {
    if (!isLogged) return false;
    const nm = String(nameDraft || "").trim();
    const ph = normalizePhoneDigits(phoneDraft);
    return nm.length < 2 || ph.length < 10; // validação completa é no controller
  }, [isLogged, nameDraft, phoneDraft]);

  const phoneDisplay = useMemo(() => formatPhoneBR(phoneDraft), [phoneDraft]);

  const createdAtLabel = useMemo(() => (createdAtIso ? formatBRDateTime(createdAtIso) : "—"), [
    createdAtIso,
  ]);

  const trialStartLabel = useMemo(() => (trialStartAt ? formatBRDateTime(trialStartAt) : "—"), [
    trialStartAt,
  ]);

  const trialEndLabel = useMemo(() => (trialEndAt ? formatBRDateTime(trialEndAt) : "—"), [
    trialEndAt,
  ]);

  const trialDaysLeft = useMemo(() => {
    if (!isLogged) return 0;
    if (!trialEndAt) return 0;
    const nowIso = new Date().toISOString();
    const left = diffDaysCeil(nowIso, trialEndAt);
    return Math.max(0, left);
  }, [isLogged, trialEndAt]);

  const trialLabel = useMemo(() => {
    if (isGuest) return "—";
    if (!trialEndAt) return "—";
    if (trialActive) return `ativo (${trialDaysLeft} dia(s) restante(s))`;
    return "encerrado";
  }, [isGuest, trialEndAt, trialActive, trialDaysLeft]);

  const photoSrc = useMemo(() => {
    const a = String(photoPreview || "").trim();
    if (a) return a;
    const b = String(photoURL || "").trim();
    return b || "";
  }, [photoPreview, photoURL]);

  return {
    isLogged,
    needsProfile,
    initials,
    phoneDisplay,
    createdAtLabel,
    trialStartLabel,
    trialEndLabel,
    trialLabel,
    photoSrc,

    // também devolvo alguns dados úteis, caso você queira log/inspecionar
    uid: String(uid || ""),
    email: String(email || ""),
  };
}



