import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Config dédiée aux tests unitaires (fonctions pures). On n'a pas besoin des
// plugins applicatifs ni d'un environnement DOM, mais l'alias @/ -> src/ doit
// être présent (les modules testés l'utilisent dans leurs imports internes).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
