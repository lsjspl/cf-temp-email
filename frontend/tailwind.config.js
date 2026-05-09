/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
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
