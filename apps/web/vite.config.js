import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vitest (`npm test`). Kept minimal on purpose: jsdom for components, one
  // setup file, tests next to the code they cover (*.test.js / *.test.jsx).
  // UTC so date/time formatting assertions don't depend on the machine.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    env: { TZ: 'UTC' },
    restoreMocks: true,
  },
})
