/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50:  "#f0f4ff",
          100: "#dce8ff",
          200: "#b3ccff",
          300: "#80aaff",
          400: "#4d88ff",
          500: "#1a66ff",
          600: "#1e3d6e",
          700: "#152c55",
          800: "#0f2040",
          900: "#0a1628",
          950: "#060e1a",
        },
        gold: {
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#c8821a",
          600: "#a86214",
          700: "#854913",
        },
      },
      animation: {
        "spin-slow": "spin 2s linear infinite",
      },
    },
  },
  plugins: [],
};
