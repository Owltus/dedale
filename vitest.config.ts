import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

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
  test: {
    // Couverture (`npm run test:couverture`) : mesurée sur tout `src/`, hors code
    // généré. Pas de seuil global : `scripts/couverture-cliquet.mjs` interdit le
    // RECUL module par module (décision PO du 25/11/2026).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/routeTree.gen.ts',
        'src/lib/database.types.ts',
        'src/vite-env.d.ts',
      ],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'reports/couverture',
    },
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
        // React Compiler, comme en production (vite.config.ts) : les composants et
        // hooks testés sont mémoïsés par le compilateur, pas à la main — une
        // identité stable entre rendus ne se vérifie qu'avec lui. Le code de TEST
        // (fichiers *.test.*, harnais src/test/) reste non compilé : il lit l'état
        // du formulaire par `watch()` au rendu, ce que le compilateur figerait.
        plugins: [
          babel({
            presets: [reactCompilerPreset()],
            exclude: [/\.test\.tsx?$/, /\/src\/test\//],
          }),
        ],
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
