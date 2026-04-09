/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}', './electron/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display',
          'SF Pro Text', 'system-ui', 'sans-serif',
        ],
      },
      fontSize: {
        xs:   ['11px', { lineHeight: '1.4' }],
        sm:   ['12px', { lineHeight: '1.45' }],
        base: ['13px', { lineHeight: '1.5' }],
        md:   ['14px', { lineHeight: '1.5' }],
        lg:   ['16px', { lineHeight: '1.4' }],
        xl:   ['20px', { lineHeight: '1.3' }],
        '2xl': ['28px', { lineHeight: '1.2' }],
        '3xl': ['40px', { lineHeight: '1.1' }],
      },
      colors: {
        bg: {
          primary:   '#0A0A0F',
          secondary: '#111118',
          tertiary:  '#1A1A24',
          elevated:  '#20202E',
        },
        border: {
          subtle:  'rgba(255,255,255,0.06)',
          default: 'rgba(255,255,255,0.10)',
        },
        text: {
          primary:   '#F0F0F5',
          secondary: '#A0A0B0',
          tertiary:  '#606070',
        },
        accent: {
          blue:   '#3B82F6',
          violet: '#8B5CF6',
        },
        risk: {
          low:        '#10B981',
          medium:     '#F59E0B',
          high:       '#EF4444',
          severe:     '#DC2626',
          unverified: '#6B7280',
        },
      },
      borderRadius: {
        card:   '10px',
        button: '7px',
        badge:  '5px',
        input:  '8px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
}
