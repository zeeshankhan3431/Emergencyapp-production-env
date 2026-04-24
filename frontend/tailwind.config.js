/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#dc2626',
          light: '#fef2f2',
          dark: '#b91c1c',
        },
      },
    },
  },
  plugins: [],
}
