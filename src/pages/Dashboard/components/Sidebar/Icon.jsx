// src/pages/Dashboard/components/Sidebar/Icon.jsx
import React from "react";

export default function Icon({ name = "home" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" };
  const stroke = "rgba(255,255,255,0.88)";
  const gold = "rgba(201,168,62,0.92)";

  if (name === "home") {
    return (
      <svg {...common}>
        <path
          d="M4 10.5 12 4l8 6.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9.5Z"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M9.5 22V14h5v8"
          stroke={gold}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "user") {
    return (
      <svg {...common}>
        <path
          d="M20 21a8 8 0 1 0-16 0"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
          stroke={gold}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg {...common}>
        <path
          d="M7 2v3M17 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M7 13h4M7 17h6"
          stroke={gold}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "trophy") {
    return (
      <svg {...common}>
        <path
          d="M8 4h8v3a4 4 0 0 1-8 0V4Z"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M6 6H4a2 2 0 0 0 2 4"
          stroke={gold}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M18 6h2a2 2 0 0 1-2 4"
          stroke={gold}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M12 11v4" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        <path d="M8 21h8M10 15h4" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "clock") {
    return (
      <svg {...common}>
        <path
          d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z"
          stroke={stroke}
          strokeWidth="2"
        />
        <path
          d="M12 6v6l4 2"
          stroke={gold}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg {...common}>
        <path
          d="M11 19a8 8 0 1 0-8-8 8 8 0 0 0 8 8Z"
          stroke={stroke}
          strokeWidth="2"
        />
        <path d="M21 21l-4.3-4.3" stroke={gold} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "card") {
    return (
      <svg {...common}>
        <path
          d="M4 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M2 11h20" stroke={gold} strokeWidth="2" strokeLinecap="round" />
        <path d="M6 16h6" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "download") {
    return (
      <svg {...common}>
        <path d="M12 3v10" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        <path
          d="M8 11l4 4 4-4"
          stroke={gold}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M4 21h16" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // ✅ NOVO: menu (hambúrguer)
  if (name === "menu") {
    return (
      <svg {...common}>
        <path d="M4 7h16" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        <path d="M4 12h16" stroke={gold} strokeWidth="2" strokeLinecap="round" />
        <path d="M4 17h16" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "back") {
    return (
      <svg {...common}>
        <path
          d="M15 18l-6-6 6-6"
          stroke={gold}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9 12h11" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "logout") {
    return (
      <svg {...common}>
        <path
          d="M10 17l-1 0a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h1"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M15 7l5 5-5 5"
          stroke={gold}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M20 12H10" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M12 2v20" stroke={stroke} strokeWidth="2" />
      <path d="M2 12h20" stroke={gold} strokeWidth="2" />
    </svg>
  );
}
