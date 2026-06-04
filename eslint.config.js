import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Code généré : jamais linté (casse le typed-linting et n'a pas à être corrigé).
  // Code généré + Edge Functions Deno (hors tsconfig du front).
  {
    ignores: [
      'dist',
      'src/routeTree.gen.ts',
      'src/lib/database.types.ts',
      'supabase',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Les non-null assertions sont idiomatiques ici (createRoot, contexte du routeur).
      '@typescript-eslint/no-non-null-assertion': 'off',
      // TanStack Router fonctionne avec `throw redirect(...)` (objet, pas Error).
      '@typescript-eslint/only-throw-error': 'off',
      // Les fichiers de routes exportent `Route` (non-composant) à côté du composant.
      'react-refresh/only-export-components': 'off',
      // Autorise `onChange={(e) => setX(e.target.value)}` (handler React idiomatique).
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        { ignoreArrowShorthand: true },
      ],
    },
  },
)
