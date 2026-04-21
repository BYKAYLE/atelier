/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cream: "#faf9f5",
        surface: "#ffffff",
        muted: "#f0eee6",
        line: "#e5e3db",
        ink: "#2d2d2d",
        sub: "#6b6b6b",
        // dark
        dbg: "#1f1f1d",
        dsurf: "#262624",
        dmuted: "#2a2a28",
        dline: "#3d3d3b",
        dink: "#faf9f5",
        dsub: "#a1a1a1",
        terra: "#c96442",
        terraHover: "#b5573a",
      },
      fontFamily: {
        display: ["'Noto Serif KR'", "Fraunces", "Georgia", "serif"],
        sans: ["'Pretendard Variable'", "Pretendard", "Inter", "ui-sans-serif", "system-ui"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      },
      animation: {
        "fade-in": "fadeIn 180ms ease-out both",
      },
    },
  },
  plugins: [],
};
