// helper: converte foto grande em JPEG comprimido e limitado por dimensão
export async function compressImageFile(file, opts = {}) {
  const {
    maxWidth = 720,
    maxHeight = 720,
    quality = 0.78, // 0..1 (equilíbrio bom p/ selfie)
    mimeType = "image/jpeg",
  } = opts;

  if (!file) throw new Error("Arquivo inválido.");

  // iOS/Android costumam vir em HEIC -> browser pode falhar.
  // Se não conseguir decodificar, vamos estourar aqui (melhor tratar UI).
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Falha ao ler a imagem."));
    r.onload = () => resolve(String(r.result || ""));
    r.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Falha ao carregar a imagem."));
    i.src = dataUrl;
  });

  // calcula escala mantendo aspect ratio
  let { width, height } = img;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      mimeType,
      quality
    );
  });

  if (!blob) throw new Error("Falha ao comprimir a imagem.");

  // monta um File “novo” pra upload
  const outFile = new File([blob], "profile.jpg", { type: mimeType });

  // preview rápido sem base64 (melhor performance)
  const previewUrl = URL.createObjectURL(outFile);

  return { file: outFile, previewUrl };
}
