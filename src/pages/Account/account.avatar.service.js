// src/pages/Account/account.avatar.service.js

/**
 * Avatar service
 * - Preview (ObjectURL) fica no componente
 * - Aqui fica: resize/compress + upload no Firebase Storage
 */

import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

/* =========================
   Utils
========================= */

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    try {
      const r = new FileReader();
      r.onerror = () => reject(new Error("Falha ao ler imagem."));
      r.onload = () => resolve(String(r.result || ""));
      r.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Resize/compress image client-side (mobile-friendly)
 * - maxSide: 768 (bom p/ avatar)
 * - quality: 0.82 (jpeg)
 */
export async function resizeImageToJpegBlob(
  file,
  { maxSide = 768, quality = 0.82 } = {}
) {
  const inputFile = file;
  if (!inputFile) throw new Error("Arquivo inválido.");

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(inputFile);
  } catch {
    bitmap = null;
  }

  let w = 0;
  let h = 0;

  if (bitmap) {
    w = bitmap.width;
    h = bitmap.height;
  } else {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error("Falha ao ler imagem."));
      r.onload = () => resolve(String(r.result || ""));
      r.readAsDataURL(inputFile);
    });

    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Falha ao carregar imagem."));
      i.src = dataUrl;
    });

    w = img.naturalWidth || img.width;
    h = img.naturalHeight || img.height;

    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(img, 0, 0);
    bitmap = await createImageBitmap(tmp);
  }

  const scale = Math.min(1, maxSide / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, outW, outH);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      "image/jpeg",
      Math.min(0.95, Math.max(0.5, quality))
    );
  });

  if (!blob) throw new Error("Falha ao converter imagem.");
  return blob;
}

/**
 * Upload do avatar (jpeg) e retorno da URL pública.
 * Retorna { ok, url }.
 */
export async function uploadAvatarJpegToStorage(storage, uid, file) {
  const u = String(uid || "").trim();
  if (!u) return { ok: false, url: "" };
  if (!file) return { ok: false, url: "" };

  try {
    const blob = await resizeImageToJpegBlob(file, { maxSide: 768, quality: 0.82 });

    const path = `users/${u}/avatar/${Date.now()}.jpg`;
    const sref = storageRef(storage, path);

    await uploadBytes(sref, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(sref);

    return { ok: true, url: String(url || "") };
  } catch {
    return { ok: false, url: "" };
  }
}
