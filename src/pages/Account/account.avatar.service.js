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

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function safeCloseBitmap(bitmap) {
  try {
    if (bitmap && typeof bitmap.close === "function") bitmap.close();
  } catch {
    // ignore
  }
}

/**
 * Resize/compress image client-side (mobile-friendly)
 * - maxSide: 768 (bom p/ avatar)
 * - quality: 0.82 (jpeg)
 *
 * Notas:
 * - Preenche fundo branco para imagens com alpha (PNG/WEBP), evitando fundo preto em JPEG.
 * - Protege ctx null (canvas bloqueado / WebView).
 * - Fecha ImageBitmap quando possível.
 */
export async function resizeImageToJpegBlob(
  file,
  { maxSide = 768, quality = 0.82, background = "#FFFFFF" } = {}
) {
  const inputFile = file;
  if (!inputFile) throw new Error("Arquivo inválido.");

  let bitmap = null;
  let w = 0;
  let h = 0;

  try {
    try {
      bitmap = await createImageBitmap(inputFile);
    } catch {
      bitmap = null;
    }

    if (bitmap) {
      w = bitmap.width;
      h = bitmap.height;
    } else {
      // Fallback: FileReader -> Image -> Canvas -> ImageBitmap
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
      if (!tctx) throw new Error("Canvas 2D não disponível.");

      // fundo branco (evita problemas com alpha ao virar JPEG)
      tctx.fillStyle = background;
      tctx.fillRect(0, 0, w, h);
      tctx.drawImage(img, 0, 0);

      bitmap = await createImageBitmap(tmp);
    }

    const scale = Math.min(1, Number(maxSide) / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D não disponível.");

    // fundo branco (mantém consistência p/ JPEG)
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, outW, outH);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, outW, outH);

    const q = clamp(quality, 0.5, 0.95);

    // toBlob pode falhar / retornar null
    const blob = await new Promise((resolve) => {
      if (!canvas.toBlob) return resolve(null);
      canvas.toBlob((b) => resolve(b), "image/jpeg", q);
    });

    if (!blob) throw new Error("Falha ao converter imagem.");
    return blob;
  } finally {
    safeCloseBitmap(bitmap);
  }
}

/**
 * Upload do avatar (jpeg) e retorno da URL pública.
 * Retorna { ok, url, error? }.
 */
export async function uploadAvatarJpegToStorage(storage, uid, file) {
  const u = String(uid || "").trim();
  if (!u) return { ok: false, url: "", error: "UID inválido." };
  if (!file) return { ok: false, url: "", error: "Arquivo inválido." };

  try {
    const blob = await resizeImageToJpegBlob(file, {
      maxSide: 768,
      quality: 0.82,
      background: "#FFFFFF",
    });

    const objName = `${Date.now()}.jpg`;
    const path = `users/${u}/avatar/${objName}`;
    const sref = storageRef(storage, path);

    await uploadBytes(sref, blob, {
      contentType: "image/jpeg",
      cacheControl: "public,max-age=31536000,immutable",
    });

    const url = await getDownloadURL(sref);

    return { ok: true, url: String(url || "") };
  } catch (e) {
    return { ok: false, url: "", error: e?.message || "Falha no upload do avatar." };
  }
}
