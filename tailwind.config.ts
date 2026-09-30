import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // maydayco.dog "Book with us" palette — warm cream, navy ink,
        // purple accent, gold highlight, steel-blue utility text.
        cream: "#F2ECDC",
        card: "#F8F4E9",
        navy: "#1B2E33",
        purple: "#4F3F82",
        gold: "#B8863A",
        steel: "#5D7A89",
        hairline: "#DBD4BF",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
