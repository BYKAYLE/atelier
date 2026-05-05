import React from "react";

interface IconProps {
  d: React.ReactNode;
  size?: number;
  stroke?: number;
  className?: string;
}

const Icon: React.FC<IconProps> = ({ d, size = 16, stroke = 1.6, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {d}
  </svg>
);

export const I = {
  plus: (
    <Icon
      d={
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      }
    />
  ),
  x: (
    <Icon
      d={
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      }
    />
  ),
  sun: (
    <Icon
      d={
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      }
    />
  ),
  moon: <Icon d={<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />} />,
  gear: (
    <Icon
      d={
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5h0a1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
        </>
      }
    />
  ),
  zap: <Icon d={<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />} />,
  fastPreview: (
    <Icon
      size={18}
      stroke={1.9}
      d={
        <>
          <path d="M4.5 18.5V6.8c0-1.2 1-2.2 2.2-2.2h11.1c1.2 0 2.2 1 2.2 2.2v2" />
          <path d="M4.5 8.4h13.9" />
          <path d="M7.5 6.5h.01M10.2 6.5h.01M12.9 6.5h.01" />
          <path d="M8 12.5h5.8" />
          <path d="M6.7 15.4h6.3" />
          <path d="M15.7 12.8l3.7-4.9-.7 4h2.8l-4.1 5.4.7-4.5h-2.4z" />
        </>
      }
    />
  ),
  image: (
    <Icon
      d={
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </>
      }
    />
  ),
  imagePaste: (
    <Icon
      size={18}
      stroke={1.9}
      d={
        <>
          <rect x="3.5" y="4" width="10.5" height="10.5" rx="2" strokeDasharray="2.6 2.6" />
          <circle cx="7.2" cy="7.9" r="1" fill="currentColor" stroke="none" />
          <path d="M5.9 12l2.8-2.7 2.2 1.9 2.4-2.5" />
          <path d="M14.8 9.3h2.3a3.4 3.4 0 013.4 3.4v.3" />
          <path d="M18.7 11.2l1.8 1.8-1.8 1.8" />
          <rect x="14.6" y="15" width="6.1" height="5.5" rx="1.4" />
          <path d="M16.5 15v-.9c0-.8.6-1.4 1.4-1.4h.3c.8 0 1.4.6 1.4 1.4v.9" />
        </>
      }
    />
  ),
  globe: (
    <Icon
      d={
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
        </>
      }
    />
  ),
  eye: (
    <Icon
      d={
        <>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      }
    />
  ),
  preview: (
    <Icon
      size={18}
      stroke={1.9}
      d={
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.3" />
          <path d="M3.5 8.2h17" />
          <path d="M7 6.4h.01M10 6.4h.01M13 6.4h.01" />
          <path d="M6.5 13.6s2.2-3.2 5.5-3.2 5.5 3.2 5.5 3.2-2.2 3.2-5.5 3.2-5.5-3.2-5.5-3.2z" />
          <circle cx="12" cy="13.6" r="1.35" />
        </>
      }
    />
  ),
  keyboard: (
    <Icon
      d={
        <>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12" />
        </>
      }
    />
  ),
  palette: (
    <Icon
      d={
        <>
          <path d="M12 22a10 10 0 110-20 8 8 0 018 8c0 3-3 3-4 3h-1a2 2 0 00-1 4 2 2 0 01-2 5z" />
          <circle cx="7.5" cy="10.5" r="1" />
          <circle cx="12" cy="7.5" r="1" />
          <circle cx="16.5" cy="10.5" r="1" />
        </>
      }
    />
  ),
  terminal: (
    <Icon
      d={
        <>
          <path d="M4 17l5-5-5-5" />
          <path d="M12 19h8" />
        </>
      }
    />
  ),
  hand: (
    <Icon
      d={
        <>
          <path d="M18 11V7.5a1.5 1.5 0 00-3 0V10" />
          <path d="M15 10V6.5a1.5 1.5 0 00-3 0V10" />
          <path d="M12 10V7.5a1.5 1.5 0 00-3 0v5" />
          <path d="M9 12.5l-1.4-1.4a1.6 1.6 0 00-2.3 2.2l4.2 5.1A6 6 0 0014.1 21H15a6 6 0 006-6v-4a1.5 1.5 0 00-3 0" />
        </>
      }
    />
  ),
  shieldCheck: (
    <Icon
      d={
        <>
          <path d="M12 3l7 3v5c0 4.2-2.8 7.9-7 9-4.2-1.1-7-4.8-7-9V6l7-3z" />
          <path d="M8.7 12.1l2.1 2.1 4.5-4.5" />
        </>
      }
    />
  ),
  shieldAlert: (
    <Icon
      d={
        <>
          <path d="M12 3l7 3v5c0 4.2-2.8 7.9-7 9-4.2-1.1-7-4.8-7-9V6l7-3z" />
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
        </>
      }
    />
  ),
  chevron: <Icon d={<path d="M6 9l6 6 6-6" />} />,
  dot: <Icon d={<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />} />,
  paperclip: (
    <Icon d={<path d="M21.4 11.1l-9.2 9.2a5 5 0 01-7.1-7.1l9.2-9.2a3.5 3.5 0 014.9 4.9l-9.1 9.1a2 2 0 01-2.8-2.8l8.4-8.4" />} />
  ),
  split: (
    <Icon
      d={
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M12 4v16" />
        </>
      }
    />
  ),
};
