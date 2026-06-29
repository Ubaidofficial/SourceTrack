/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Switzer', 'Inter', 'system-ui', '-apple-system', 'sans-serif']
      },
      colors: {
        st: {
          black: '#1F2323',
          gray: '#7D8090',
          lime: '#CCF03F',
          'lime-dark': '#C5E838', // Softer lime for dark mode
          green: '#00A457',
          orange: '#FF8800',
          red: '#E54545'
        },
        // Enhanced dark mode colors — layered elevation by lightness (no glow,
        // no glassmorphism). Border is an edge-of-light, not a gray line.
        dark: {
          bg: '#0F1010',      // Base background (lowest elevation)
          card: '#141515',     // Card surface (one step up)
          hover: '#1A1C1C',    // Hover / highest elevation
          border: 'rgba(255,255,255,0.06)', // Translucent edge-of-light
          text: '#E8E9EB'      // Primary dark text (never pure white)
        }
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
