import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sage: "#8a9a7b",
        cream: "#f4f1ea",
      },
    },
  },
  plugins: [],
};

export default config;
