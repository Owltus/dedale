import { defineConfig } from 'vitest/config'

// Config dédiée aux tests unitaires (fonctions pures). On n'a pas besoin des
// plugins applicatifs ni d'un environnement DOM ; les tests importent en relatif.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
