import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // J.A.R.V.I.S HUD palette — always-dark, cyan/magenta glow on near-black.
        void: "#05050b",
        panel: "#0d0d18",
        panel2: "#14142266",
        neon: {
          cyan: "#2dd9ff",
          pink: "#ff3ec8",
          purple: "#9b5cff",
        },
      },
      boxShadow: {
        glow: "0 0 12px 0 rgba(45,217,255,0.35), 0 0 4px 0 rgba(255,62,200,0.25)",
        "glow-sm": "0 0 6px 0 rgba(45,217,255,0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
