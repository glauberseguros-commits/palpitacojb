// src/pages/Dashboard/components/Sidebar/MiniLogo.jsx
import React from "react";

export default function MiniLogo({ size = 22, decorative = true }) {
  const s = Math.max(12, Number(size) || 22);

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 64 64"
      fill="none"
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative ? "true" : "false"}
      focusable="false"
      shapeRendering="geometricPrecision"
      style={{ display: "block" }}
    >
      {/* Escudo externo */}
      <path
        d="M32 4 52 14v18c0 14-9 24.5-20 28C21 56.5 12 46 12 32V14L32 4Z"
        stroke="rgba(201,168,62,0.92)"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Escudo interno */}
      <path
        d="M32 9 48 17v15c0 11-7 19.5-16 23-9-3.5-16-12-16-23V17L32 9Z"
        stroke="rgba(201,168,62,0.28)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Letra / símbolo central */}
      <path
        d="M24 44V20h14c6 0 10 3.3 10 8.7S44 38 38 38H30v6h-6Zm6-12h7c3 0 5-1.2 5-3.3S40 26 37 26h-7v6Z"
        fill="rgba(255,255,255,0.92)"
      />

      {/* Coroa superior */}
      <path
        d="M22 18l5 4 5-6 5 6 5-4 2 8H20l2-8Z"
        fill="rgba(201,168,62,0.92)"
        opacity="0.95"
      />
    </svg>
  );
}
