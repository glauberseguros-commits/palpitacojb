import React from "react";

export default function Icon({ name = "home", size = 18 }) {
  const s = Math.max(14, Number(size) || 18);

  const common = {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none",
  };

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
        <path
          d="M12 11v4"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M8 21h8M10 15h4"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "pets") {
    return (
      <svg {...common}>
        {/* Bichinho esquerdo */}
        <path
          d="M2.6 9.2 3.4 6l2 1.5L7.3 6l.8 3.2v2.1a2.75 2.75 0 0 1-5.5 0V9.2Z"
          stroke={stroke}
          strokeWidth="1.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.3 10.4h.1M6.3 10.4h.1M5.35 11.5v.1"
          stroke={gold}
          strokeWidth="1.35"
          strokeLinecap="round"
        />

        {/* Bichinho central */}
        <path
          d="M9.1 8.7 10 5.2l2 2 2-2 .9 3.5v2.5a2.9 2.9 0 0 1-5.8 0V8.7Z"
          stroke={gold}
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.8 10.2h.1M13.1 10.2h.1M12 11.5v.1"
          stroke={stroke}
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* Bichinho direito */}
        <path
          d="M16 9.2 16.8 6l1.9 1.5L20.6 6l.8 3.2v2.1a2.7 2.7 0 0 1-5.4 0V9.2Z"
          stroke={stroke}
          strokeWidth="1.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17.7 10.4h.1M19.7 10.4h.1M18.75 11.5v.1"
          stroke={gold}
          strokeWidth="1.35"
          strokeLinecap="round"
        />

        {/* Base visual do trio */}
        <path
          d="M3.2 16.8c.8-1.5 2-2.2 3.2-2.2 1 0 1.9.4 2.6 1.2"
          stroke={stroke}
          strokeWidth="1.45"
          strokeLinecap="round"
        />
        <path
          d="M8.3 17.8c.9-1.9 2.2-2.8 3.7-2.8s2.8.9 3.7 2.8"
          stroke={gold}
          strokeWidth="1.55"
          strokeLinecap="round"
        />
        <path
          d="M15 15.8c.7-.8 1.6-1.2 2.6-1.2 1.2 0 2.4.7 3.2 2.2"
          stroke={stroke}
          strokeWidth="1.45"
          strokeLinecap="round"
        />
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
        <path d="M11 19a8 8 0 1 0-8-8 8 8 0 0 0 8 8Z" stroke={stroke} strokeWidth="2" />
        <path
          d="M21 21l-4.3-4.3"
          stroke={gold}
          strokeWidth="2"
          strokeLinecap="round"
        />
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

  if (name === "menu") {
    return (
      <svg {...common}>
        <path d="M4 7h16" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        <path d="M4 12h16" stroke={gold} strokeWidth="2" strokeLinecap="round" />
        <path d="M4 17h16" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "hash") {
    return (
      <svg {...common}>
        <path d="M9 3L7 21" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        <path d="M17 3l-2 18" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        <path d="M5 8h16" stroke={gold} strokeWidth="2" strokeLinecap="round" />
        <path d="M3 16h16" stroke={gold} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "chart") {
    return (
      <svg {...common}>
        <path
          d="M4 20V13h4v7H4Z"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M10 20V8h4v12h-4Z"
          stroke={gold}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M16 20V4h4v16h-4Z"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
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
      <path d="M12 2v20" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <path d="M2 12h20" stroke={gold} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}