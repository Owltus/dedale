import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

// Deux projets de test, volontairement séparés :
//
//  - `unite` : les fonctions PURES. Pas de DOM, pas de plugin applicatif — c'est
//    ce qui rend la suite instantanée, et c'est aussi le seul périmètre que le
//    mutation testing (Stryker) sait muter.
//  - `dom`   : les composants et les hooks, qui ont besoin d'un document. Fichiers
//    suffixés `.dom.test.tsx` / `.dom.test.ts` pour que l'appartenance soit lisible
//    dans le nom plutôt que dans une configuration lointaine.
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unite',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.dom.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'dom',
          include: ['src/**/*.dom.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.dom.ts'],
          globals: true,
        },
      },
    ],
  },
})
