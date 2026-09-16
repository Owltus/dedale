/**
 * Outillage de TEST (jamais importé par le code de production).
 *
 * Trois besoins reviennent dans les tests DOM des briques de `common/` :
 *
 *  1. un CONTEXTE react-hook-form (les champs de `common/fields/` lisent
 *     `useFormContext` via `useFormField` : sans `FormProvider`, ils jettent) ;
 *  2. un CONTEXTE de routeur TanStack (`PageHeader` appelle `useDocumentTitle`,
 *     qui appelle `useLocation`) ;
 *  3. des RÉSULTATS de requête pour `QueryState`, soit fabriqués (matrice
 *     d'états, instantanée et déterministe), soit VRAIS (pour prouver qu'un
 *     bouton « Réessayer » relance réellement la requête).
 *
 * Tout cela était sinon recopié dans chaque fichier de test.
 */
import '@testing-library/jest-dom/vitest'
import type { ReactElement, ReactNode } from 'react'
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, type RenderResult } from '@testing-library/react'
import fc from 'fast-check'
import { Form } from '@/components/ui/form'

/* ------------------------------------------------------------------ */
/* 1. Formulaire react-hook-form                                       */
/* ------------------------------------------------------------------ */

/**
 * Enveloppe un fragment de formulaire dans un vrai `useForm` + `FormProvider`.
 * La render-prop reçoit le `UseFormReturn` complet : un test peut donc lire
 * `form.getValues()` pour vérifier ce que le champ a réellement écrit, sans
 * espionner le composant testé.
 */
export function FormulaireTest<T extends FieldValues>({
  defaultValues,
  children,
}: {
  defaultValues: T
  children: (form: UseFormReturn<T>) => ReactNode
}) {
  const form = useForm<T>({ defaultValues: defaultValues as never })
  return <Form {...form}>{children(form)}</Form>
}

/* ------------------------------------------------------------------ */
/* 2. Routeur TanStack                                                 */
/* ------------------------------------------------------------------ */

/**
 * Rend `ui` sous un routeur en mémoire (une seule route `/`). Nécessaire dès
 * qu'un composant descend jusqu'à `PageHeader` : `useDocumentTitle` y appelle
 * `useLocation`, qui exige le contexte du routeur.
 */
export function renderAvecRouteur(ui: ReactNode): RenderResult {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

/* ------------------------------------------------------------------ */
/* 3. Requêtes TanStack Query                                          */
/* ------------------------------------------------------------------ */

/** Client de test : aucune reprise automatique, aucun cache résiduel. */
export function creerQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

/** Rend `ui` sous un `QueryClientProvider` neuf. */
export function renderAvecQueryClient(ui: ReactElement): RenderResult {
  const client = creerQueryClient()
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

/**
 * Résultats de requête FABRIQUÉS, pour piloter `QueryState` sans réseau ni
 * horloge. `QueryState` ne lit que `isPending`, `isError`, `data` et `refetch` :
 * on ne fabrique que ce contrat, le reste est complété pour satisfaire le type.
 */
function baseQueryResult(): Record<string, unknown> {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    isSuccess: false,
    isLoading: false,
    isFetching: false,
    isRefetching: false,
    isStale: false,
    status: 'success',
    fetchStatus: 'idle',
    refetch: () => Promise.resolve(undefined),
  }
}

/** Requête en CHARGEMENT (`isPending`). */
export function queryEnChargement<T>(): UseQueryResult<T> {
  return {
    ...baseQueryResult(),
    isPending: true,
    isLoading: true,
    status: 'pending',
    fetchStatus: 'fetching',
  } as unknown as UseQueryResult<T>
}

/** Requête en ERREUR, avec un `refetch` espionnable. */
export function queryEnErreur<T>(
  refetch: () => Promise<unknown> = () => Promise.resolve(undefined),
): UseQueryResult<T> {
  return {
    ...baseQueryResult(),
    isError: true,
    error: new Error('panne simulée'),
    status: 'error',
    refetch,
  } as unknown as UseQueryResult<T>
}

/** Requête ABOUTIE, portant `data`. */
export function queryAboutie<T>(data: T): UseQueryResult<T> {
  return {
    ...baseQueryResult(),
    data,
    isSuccess: true,
    status: 'success',
  } as unknown as UseQueryResult<T>
}

/* ------------------------------------------------------------------ */
/* 4. Corpus de textes hostiles (fuzzing d'affichage)                  */
/* ------------------------------------------------------------------ */

/**
 * Textes que l'utilisateur (ou un import CSV) peut réellement faire entrer dans
 * un titre / sous-titre / badge. Oracle commun : ils doivent ressortir en TEXTE
 * (`textContent`), jamais interprétés comme du balisage.
 */
export const TEXTES_HOSTILES = [
  '',
  ' ',
  '<script>alert(1)</script>',
  // NB : l'audit d'interface relève cette ligne comme « image cassée ». Faux
  // positif assumé — c'est une CHARGE de test, jamais rendue comme balise :
  // l'oracle des tests est précisément qu'elle ressorte en TEXTE.
  '<img src=x onerror="alert(1)">',
  '"><b>gras</b>',
  '&lt;déjà échappé&gt;',
  '{{ template }}',
  '${injection}',
  '🧯🚿🔧 équipement',
  'مبنى الصيانة',
  'Local‮noisiuc',
  'A'.repeat(5000),
  'Chaufferie — Sous-sol N°2 (Bâtiment « Aile Est »)',
] as const

/**
 * Arbitraire fast-check équivalent : chaînes quelconques, dont les fragments de
 * balisage et les très longues. `fc.string` seul ne produit presque jamais de
 * `<script>` ; on l'y aide explicitement.
 */
export const texteHostileArb = fc.oneof(
  fc.string(),
  fc.string({ minLength: 200, maxLength: 1200 }),
  fc.constantFrom(...TEXTES_HOSTILES),
  fc
    .tuple(fc.string(), fc.constantFrom('<script>', '<img', '</div>', '<b>'))
    .map(([a, b]) => `${a}${b}${a}`),
)

/** Rejeu FIXE : un contre-exemple trouvé doit être retrouvé au run suivant. */
export const TIRAGES = { numRuns: 200, seed: 42 } as const
