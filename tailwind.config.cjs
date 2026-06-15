/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Rimuoviamo le sezioni colors e fontFamily.
      // Le classi standard Tailwind (indigo, red, green) verranno usate.
    },
  },
  plugins: [],
};