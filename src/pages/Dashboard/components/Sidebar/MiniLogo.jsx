import React from "react";

export default function MiniLogo({
  size = 48,
  decorative = true,
  src = "/logo/palpitaco-jb.png",
}) {
  const s = Math.max(24, Number(size) || 48);

  return (
    <img
      src={src}
      alt={decorative ? "" : "Palpitaco JB"}
      aria-hidden={decorative ? "true" : "false"}
      width={s}
      height={s}
      draggable="false"
      style={{
        display: "block",
        width: s,
        height: s,
        objectFit: "contain",
        userSelect: "none",
        pointerEvents: "none",
        filter: "drop-shadow(0 4px 14px rgba(202,166,75,0.18))",
      }}
    />
  );
}