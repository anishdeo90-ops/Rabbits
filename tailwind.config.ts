import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#fff1f7",
          100: "#ffe0ee",
          200: "#ffc2dd",
          300: "#ff9bc6",
          400: "#ff6fae",
          500: "#ff2d87",
          600: "#e91773",
          700: "#c90d5f",
          800: "#a60f50",
          900: "#8a1247",
        },
        ink: "#0F0F0F",
        graphite: "#4A4A4A",
        shell: "#F5F5F7",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};

export default config;
