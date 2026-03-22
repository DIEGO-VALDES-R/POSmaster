/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
    "!./node_modules/**",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0f172a',
        secondary: '#3b82f6',
        accent: '#f59e0b',
        success: '#10b981',
        danger: '#ef4444',
      }
    }
  },
  plugins: [],
}