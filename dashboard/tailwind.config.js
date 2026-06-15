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
          bg: '#0F1212',      // Main background (premium calming dark)
          card: '#161919',     // Card background (slightly lighter for elevation)
          border: '#242929',   // Soft dark borders
          hover: '#1D2121'     // Hover/subtle background states
        }
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
