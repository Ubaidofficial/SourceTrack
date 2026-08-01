/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'monospace']
      },
      colors: {
        st: {
          black: '#12100C',
          gray: '#6E675C',
          lime: '#D2EC2A',
          'lime-dark': '#BCD41C', // Softer lime for dark mode
          orange: '#FF7A33',
          red: '#C4381C'
        },
        // Warm neutral ramp (design.md §3.2/§3.3). Overrides Tailwind's cool
        // default gray — the warmth lives in the neutrals, not the accent.
        gray: {
          50: '#F7F4ED',
          100: '#F1EDE3',
          200: '#E7E0D2',
          300: '#D6CDBB',
          400: '#A39B8C',
          500: '#6E675C',
          600: '#565045',
          700: '#3D3830',
          800: '#241F17',
          900: '#1B1811',
          950: '#12100C'
        },
        // Enhanced dark mode colors — layered elevation by lightness (no glow,
        // no glassmorphism). Border is an edge-of-light, not a gray line.
        dark: {
          bg: '#12100C',      // Base background (lowest elevation)
          card: '#1B1811',     // Card surface (one step up)
          hover: '#241F17',    // Hover / highest elevation
          border: '#302B22', // Solid warm edge (surfaces)
          'border-strong': '#3D3830', // Interactive controls (inputs/selects) — reads as an affordance, still below the lime focus ring
          text: '#F6F3EB'      // Primary dark text (never pure white)
        }
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
