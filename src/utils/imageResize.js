/**
 * imageResize.js
 * - compressImageFile: reduz dimensão + comprime para JPEG/PNG via Canvas
 * - Retorna previewUrl + revokePreview() para evitar vazamento de memória
 */

export async function compressImageFile(file, opts = {}) {
  const {
    maxWidth = 720,
    maxHeight = 720,
    quality = 0.78, // 0..1 (equilíbrio bom p/ selfie)
    mimeType = "image/jpeg",
    filename = null, // opcional: força nome final
  } = opts;

  if (!file) throw new Error("Arquivo inválido.");

  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Falha ao ler a imagem."));
    r.onload = () => {
      const v = String(r.result || "");
      if (!v) return reject(new Error("Falha ao ler a imagem."));
      resolve(v);
    };
    r.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Falha ao carregar a imagem."));
    i.src = dataUrl;
  });

  const srcW = Number(img.width) || 1;
  const srcH = Number(img.height) || 1;

  const scale = Math.min(maxWidth / srcW, maxHeight / srcH, 1);
  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b || null), mimeType, quality);
  });

  if (!blob) throw new Error("Falha ao comprimir a imagem.");

  const baseName =
    filename ||
    (file.name && file.name.includes(".")
      ? file.name.replace(/\.[^.]+$/, "")
      : "profile");

  const ext = String(mimeType).toLowerCase().includes("png") ? "png" : "jpg";
  const outName = `${baseName}.${ext}`;

  const outFile = new File([blob], outName, { type: mimeType });

  const previewUrl = URL.createObjectURL(outFile);
  const revokePreview = () => {
    try { URL.revokeObjectURL(previewUrl); } catch {}
  };

  return { file: outFile, previewUrl, revokePreview, width: targetW, height: targetH };
}
