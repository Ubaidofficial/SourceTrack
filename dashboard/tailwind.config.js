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
          green: '#00A457',
          orange: '#FF8800',
          red: '#E54545'
        }
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
