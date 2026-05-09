/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontSize: {
        xs: ["13px", "1.5"],
        sm: ["15px", "1.6"],
        base: ["16px", "1.6"],
        lg: ["18px", "1.5"],
        xl: ["20px", "1.4"],
        "2xl": ["24px", "1.3"],
        "3xl": ["30px", "1.2"],
      },
      colors: {
        bg: "#0b0d10",
        panel: "rgba(16, 19, 24, 0.88)",
        "panel-strong": "rgba(21, 25, 32, 0.96)",
        line: "rgba(255, 255, 255, 0.08)",
        "line-strong": "rgba(255, 255, 255, 0.14)",
        muted: "#97a4b5",
        accent: "#8ff7c2",
        "accent-strong": "#49d697",
        danger: "#ff7d7d",
        warning: "#ffce6d",
      },
    },
  },
  plugins: [],
};
