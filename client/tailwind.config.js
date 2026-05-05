
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0f1b2d',
        secondary: '#c2410c',
        dark: '#111827',
        light: '#f5f3ef',
        rust: '#b73b1f',
        brown: '#5f3b25'
      }
    },
  },
  plugins: [],
}
