/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif']
      },
      colors: {
        st: {
          black: '#1F2323',
          gray: '#7D8090',
          lime: '#CCF03F',
          green: '#00AA57',
          orange: '#FF8800',
          red: '#E54545'
        }
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
