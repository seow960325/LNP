/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Semantic tokens — mirrored as CSS variables in src/index.css
      colors: {
        cream: '#FFFBEB',
        surface: '#FFFFFF',
        accent: {
          DEFAULT: '#D97706',
          hover: '#B45309',
          soft: '#FEF3C7',
        },
        ink: '#1E293B',
        muted: '#78716C',
        line: '#E7E5E4',
        danger: '#DC2626',
        success: {
          DEFAULT: '#16A34A',
          soft: '#DCFCE7',
        },
      },
      fontFamily: {
        sans: ['Nunito', 'system-ui', 'sans-serif'],
        handwriting: ['Caveat', 'cursive'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
        '30': '7.5rem',
      },
      minHeight: {
        'tap':    '2.75rem',
        'tap-lg': '3.5rem',
      },
      minWidth: {
        'tap': '2.75rem',
      },
      boxShadow: {
        'card':    '0 2px 8px 0 rgba(0,0,0,0.05)',
        'card-md': '0 4px 16px 0 rgba(0,0,0,0.07)',
        'card-lg': '0 8px 24px 0 rgba(0,0,0,0.10)',
      },
      animation: {
        'fade-in':  'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
