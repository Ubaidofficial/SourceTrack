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
        // Enhanced dark mode colors
        dark: {
          bg: '#1A1D1F',      // Main background (lighter than st-black)
          card: '#242829',     // Card background (lighter than background)
          border: '#2A2E31',   // Subtle borders
          hover: '#2D3135'     // Hover states
        }
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
