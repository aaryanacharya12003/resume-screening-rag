/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F5F6FC', bg2: '#ECEEF9', paper: '#FFFFFF', ink: '#1C1B3F', muted: '#5A5D7E', faint: '#A2A6C4', line: '#DFE3F1',
        panel: '#2F2A8C', accent: '#6EF0C2', orange: '#FFC98A', hot: '#FF4F8B', blue: '#8FA8FF', green: '#DDF8A0', pink: '#F7B3D9',
        good: '#047857', warn: '#B45309', bad: '#DC2626',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        hand: ['Kalam', 'cursive'],
      },
      boxShadow: { hard: '4px 4px 0 0 #1C1B3F', 'hard-sm': '2px 2px 0 0 #1C1B3F' },
      borderRadius: { tag: '8px', card: '14px', panel: '18px' },
    },
  },
  plugins: [],
};
