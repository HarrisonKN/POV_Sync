/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pov: {
          bg:      'rgb(var(--pov-bg) / <alpha-value>)',
          surface: 'rgb(var(--pov-surface) / <alpha-value>)',
          border:  'rgb(var(--pov-border) / <alpha-value>)',
          accent:  'rgb(var(--pov-accent) / <alpha-value>)',
          success: 'rgb(var(--pov-success) / <alpha-value>)',
          warning: 'rgb(var(--pov-warning) / <alpha-value>)',
          danger:  'rgb(var(--pov-danger) / <alpha-value>)',
          text:    'rgb(var(--pov-text) / <alpha-value>)',
          muted:   'rgb(var(--pov-muted) / <alpha-value>)',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
