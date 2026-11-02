/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter var', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f4f2ff',
          100: '#ebe7ff',
          200: '#d9d2ff',
          300: '#bfb1ff',
          400: '#9f85ff',
          500: '#7f56ff',
          600: '#6d33f7',
          700: '#5b22d9',
          800: '#4b1db1',
          900: '#3f1b8d',
          950: '#250e5f',
        },
        ink: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#dfe3ea',
          300: '#c5ccd8',
          400: '#96a1b3',
          500: '#6b7789',
          600: '#4d5766',
          700: '#3a4250',
          800: '#262c37',
          900: '#171b23',
          950: '#0e1117',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)',
        lift: '0 10px 30px -12px rgb(76 44 184 / 0.25), 0 4px 10px -6px rgb(16 24 40 / 0.08)',
        glow: '0 0 0 1px rgb(127 86 255 / 0.18), 0 12px 40px -12px rgb(127 86 255 / 0.45)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(127 86 255 / 0.35)' },
          '70%': { boxShadow: '0 0 0 12px rgb(127 86 255 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(127 86 255 / 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-up': 'slide-up 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in': 'scale-in 0.2s ease-out',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s infinite',
      },
    },
  },
  plugins: [],
};
