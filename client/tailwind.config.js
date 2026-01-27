
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1e40af',   // Blue-900
        secondary: '#f97316', // Orange-500
        dark: '#111827',      // Gray-900
        light: '#f3f4f6'      // Gray-100
      }
    },
  },
  plugins: [],
}
