import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Configuration dediee au mutation testing : UNIQUEMENT les tests de logique
// pure. Stryker relance la suite une fois par mutant ; y embarquer les tests DOM
// (jsdom, composants Radix) rendrait la campagne interminable sans rien apporter,
// puisque seuls les modules purs sont mutes.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.dom.test.ts', 'node_modules/**'],
    environment: 'node',
  },
})
