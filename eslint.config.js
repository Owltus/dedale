import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

// =============================================================================
// Conventions du CLAUDE.md et de docs/conventions/ — briques des contrôles.
// =============================================================================
// Seules les règles qui s'expriment sur UN fichier vivent ici (erreur dès
// l'éditeur). Les règles qui lisent plusieurs fichiers, ou dont l'heuristique
// peut se tromper, vivent dans `src/lib/conventions.test.ts` (test à cliquet,
// exceptions motivées dans `src/lib/conventions-exceptions.json`).
//
// ATTENTION : pour un fichier donné, le DERNIER bloc qui configure une règle
// remplace les options des précédents. Chaque bloc ci-dessous redonne donc la
// liste complète de ce qui s'applique à son périmètre.

/** Le client Supabase n'est créé qu'une fois, dans `src/lib/supabase.ts`. */
const CREATE_CLIENT = {
  name: '@supabase/supabase-js',
  importNames: ['createClient'],
  message:
    'Le client Supabase n’est créé que dans src/lib/supabase.ts : importer `supabase` depuis @/lib/supabase (docs/conventions/donnees.md → À NE PAS FAIRE).',
}

/** Aucun `DialogContent` hors de `DialogShell`. */
const DIALOG_CONTENT = {
  name: '@/components/ui/dialog',
  importNames: ['DialogContent'],
  message:
    'Aucun DialogContent hors de DialogShell : choisir la coquille (FormDialog, ConfirmDialog, DialogShell…) (docs/conventions/composants.md → Modals).',
}

const IMPORTS_COMMUNS = [CREATE_CLIENT, DIALOG_CONTENT]

/** Recherche texte : une seule règle, `lib/recherche.ts`. */
const RECHERCHE_MAISON = {
  selector:
    "CallExpression[callee.property.name='includes']:matches([callee.object.callee.property.name='toLowerCase'], [callee.object.callee.object.callee.property.name='toLowerCase'])",
  message:
    'Recherche maison interdite : utiliser correspondRecherche / motifRechercheServeur de @/lib/recherche (casse ET accents) (docs/conventions/donnees.md → Recherche texte).',
}

/** React 19 : `ref` est une prop, plus de `forwardRef` (importé ou `React.`). */
const FORWARD_REF = {
  selector:
    ":matches(ImportDeclaration[source.value='react'] > ImportSpecifier[imported.name='forwardRef'], MemberExpression[object.name='React'][property.name='forwardRef'])",
  message:
    'React 19 : pas de forwardRef, prendre `ComponentProps` (docs/conventions/composants.md → Écrire un composant ui/common).',
}

/** Champs natifs : les briques `common/fields` et `standalone-fields`. */
const CHAMP_NATIF = {
  selector: 'JSXOpeningElement[name.name=/^(select|textarea)$/]',
  message:
    'Pas de <select>/<textarea> natif : utiliser les champs de @/components/common/fields ou common/standalone-fields (docs/conventions/composants.md → Champs de formulaire).',
}

const SYNTAXE_COMMUNE = [RECHERCHE_MAISON, FORWARD_REF, CHAMP_NATIF]

/** lib/ et hooks/ : seul le socle (rôle courant, site actif) est importable. */
const LIB_SANS_FEATURE = {
  regex: '^@/features/(?!(utilisateurs/queries|sites/site-context)$)',
  message:
    'lib/ et hooks/ n’importent de @/features que @/features/utilisateurs/queries et @/features/sites/site-context (docs/conventions/architecture.md → Règles de dépendances).',
}

/** components/common : aucun composant de feature. */
const COMMON_SANS_COMPOSANT = {
  regex: '^@/features/[^/]+/components/',
  message:
    'components/common n’importe aucun composant de feature (@/features/*/components/*) : remonter la brique dans common/ (docs/conventions/architecture.md → Règles de dépendances).',
}

/** components/ui : zéro métier. */
const UI_SANS_METIER = {
  regex: '^@/(features|components/common)(/|$)',
  message:
    'components/ui n’importe ni @/features ni @/components/common : une primitive reste sans métier (docs/conventions/architecture.md → Règles de dépendances).',
}

const sauf = (liste, ...retires) => liste.filter((x) => !retires.includes(x))

// `defineConfig` d'ESLint remplace `tseslint.config()`, déprécié.
export default defineConfig(
  // Code généré : jamais linté (casse le typed-linting et n'a pas à être corrigé).
  // Code généré + Edge Functions Deno (hors tsconfig du front).
  {
    ignores: [
      'dist',
      'src/routeTree.gen.ts',
      'src/lib/database.types.ts',
      'supabase',
      'tests/securite',
      '.stryker-tmp',
      'reports',
      // Copies de travail (git worktree) des agents : jamais lintées depuis la racine.
      '.claude/worktrees',
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

  // ===========================================================================
  // Conventions — application par périmètre (du plus large au plus précis).
  // ===========================================================================
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: IMPORTS_COMMUNS }],
      'no-restricted-syntax': ['error', ...SYNTAXE_COMMUNE],
    },
  },
  {
    // components/ui : les primitives shadcn montent elles-mêmes DialogContent
    // et les <select>/<textarea> natifs qu'elles stylent.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: sauf(IMPORTS_COMMUNS, DIALOG_CONTENT),
          patterns: [UI_SANS_METIER],
        },
      ],
      'no-restricted-syntax': ['error', ...sauf(SYNTAXE_COMMUNE, CHAMP_NATIF)],
    },
  },
  {
    // lib/ et hooks/. Les tests en sont exclus : ils importent les schémas des
    // features pour les sonder (concordance-sql.test.ts) ; ce n'est pas une
    // dépendance du code livré.
    files: ['src/lib/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: IMPORTS_COMMUNS, patterns: [LIB_SANS_FEATURE] },
      ],
    },
  },
  {
    // `lib/supabase.ts` est le seul fichier qui crée le client.
    files: ['src/lib/supabase.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: sauf(IMPORTS_COMMUNS, CREATE_CLIENT),
          patterns: [LIB_SANS_FEATURE],
        },
      ],
    },
  },
  {
    // `lib/recherche.ts` EST la règle de recherche : il normalise la casse.
    files: ['src/lib/recherche.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...sauf(SYNTAXE_COMMUNE, RECHERCHE_MAISON),
      ],
    },
  },
  {
    files: ['src/components/common/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: IMPORTS_COMMUNS, patterns: [COMMON_SANS_COMPOSANT] },
      ],
    },
  },
  {
    // DialogShell est LA coquille qui monte `DialogContent`.
    files: ['src/components/common/dialog-shell.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: sauf(IMPORTS_COMMUNS, DIALOG_CONTENT),
          patterns: [COMMON_SANS_COMPOSANT],
        },
      ],
    },
  },
  {
    // Le test des modales monte la primitive nue pour comparer son
    // comportement à celui de DialogShell (régression du gel Radix).
    files: ['src/components/common/modales.dom.test.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: sauf(IMPORTS_COMMUNS, DIALOG_CONTENT) },
      ],
    },
  },
)
