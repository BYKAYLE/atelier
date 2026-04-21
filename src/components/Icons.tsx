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
