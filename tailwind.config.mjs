import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#000000',
          900: '#050507',
          800: '#0a0a0d',
          700: '#111116',
          600: '#1a1a22',
          500: '#2a2a35',
        },
        bone: {
          DEFAULT: '#f5f5f0',
          dim: '#c8c8c0',
          mute: '#7a7a78',
        },
        signal: {
          DEFAULT: '#00ffc6',
          glow: '#00ffc6',
          dim: '#00b88f',
          deep: '#006b54',
        },
        pulse: {
          DEFAULT: '#a855f7',
          dim: '#7c3aed',
        },
        warn: '#ffb547',
        loss: '#ff5470',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Anton"', '"Bebas Neue"', 'Impact', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Mobile minimums bumped so headlines fill more of narrow viewports.
        // Caps unchanged so desktop sizing is preserved.
        'display-xl': ['clamp(3.5rem, 12vw, 7.5rem)', { lineHeight: '0.9', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(2.75rem, 8vw, 4.5rem)', { lineHeight: '0.95', letterSpacing: '-0.01em' }],
        'display-md': ['clamp(2.25rem, 6vw, 3rem)', { lineHeight: '1.05' }],
      },
      boxShadow: {
        'signal-glow': '0 0 40px rgba(0, 255, 198, 0.35)',
        'signal-soft': '0 0 24px rgba(0, 255, 198, 0.15)',
        'pulse-glow': '0 0 32px rgba(168, 85, 247, 0.35)',
      },
      backgroundImage: {
        'fade-bottom': 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 60%, #000 100%)',
        'fade-top': 'linear-gradient(to top, transparent 0%, rgba(0,0,0,0.4) 80%, #000 100%)',
        'grid-faint':
          'linear-gradient(rgba(0, 255, 198, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 198, 0.04) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '48px 48px',
      },
      animation: {
        'pulse-slow': 'pulse 4s ease-in-out infinite',
        scan: 'scan 8s linear infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [typography],
};
