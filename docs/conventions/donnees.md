# Conventions — Données (Supabase + TanStack Query) & formulaires

> Lue quand on lit/écrit des données Supabase ou qu'on fait un formulaire.

## Lecture — `queryOptions` par feature

Une requête = un `queryOptions` colocalisé dans `features/<domaine>/queries.ts`. Clé hiérarchique incluant **toute** variable qui change le résultat. Réutilisable en hook, prefetch et `setQueryData`.

```ts
export const equipementQueries = {
  all: () => ['equipements'] as const,
  list: (filtres: { siteId: string }) =>
    queryOptions({
      queryKey: [...equipementQueries.all(), 'list', filtres],
      queryFn: ({ signal }) =>
        supabase
          .from('equipements')
          .select('id, nom, statut')
          .eq('site_id', filtres.siteId)
          .is('deleted_at', null) // soft-delete : toujours filtrer
          .abortSignal(signal)
          .throwOnError(), // sinon l'erreur reste invisible pour Query
    }),
}
```

- **Toujours `.throwOnError()`** : sinon l'erreur reste dans `{ error }` et Query croit que tout va bien.
- **`.maybeSingle()`** (pas `.single()`) quand l'absence de ligne est un cas normal (RLS qui filtre → résultat vide, pas erreur).
- **Toujours filtrer le soft-delete** : `.is('deleted_at', null)` sur les listes.
- `staleTime` raisonnable (~60 s) par défaut, pas `0` partout.
- v5 : c'est `isPending` (pas `isLoading`) ; `onSuccess`/`onError` n'existent plus sur `useQuery`.

## Écriture — mutations

```ts
export function useUpdateEquipement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { id: string; nom: string }) =>
      supabase
        .from('equipements')
        .update({ nom: p.nom })
        .eq('id', p.id)
        .select()
        .single()
        .throwOnError(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: equipementQueries.all() }),
  })
}
```

- `invalidateQueries` par défaut (sûr) ; `setQueryData` quand on a déjà la donnée ; optimiste (`onMutate`/rollback) réservé aux actions sûres — **jamais** sur une suppression.
- Une transition d'état interdite (machine à états backend) renvoie une **erreur** → la catcher et l'afficher (toast/inline), idéalement griser l'action impossible en amont.

## Erreurs : distinguer vide RLS vs vraie erreur

- Lecture filtrée par RLS → `data: []` / `null` = **normal** (afficher l'état vide).
- Écriture hors scope → **erreur** `42501` à catcher.

## Types Supabase générés

- `npm run gen:types` (après `npx supabase login`) régénère `src/lib/database.types.ts`. **Ne jamais l'éditer à la main**, régénérer après chaque migration backend.
- Une fois généré : `createClient<Database>(...)` dans `src/lib/supabase.ts` → `.from()`/`.rpc()` entièrement typés. En attendant : cast explicite ponctuel.

## Upload de document = 3 étapes

(a) upload Storage → (b) insert `documents` (avec `site_id` !) → (c) insert dans la table de liaison. Un objet Storage n'est lisible qu'une fois rattaché.

## Formulaires (état contrôlé + Zod)

- Pattern projet : un composant `Dialog` + **état contrôlé** (`useState`) + **validation Zod**
  (`schema.safeParse`) au submit. Schéma défini **au niveau module** (`schemas.ts`).
- Erreurs de champ : mappées via `fieldErrors()` de `@/lib/form` (première erreur par champ).
- Ré-initialiser un formulaire d'édition : **keyer** le composant (`key={entité?.id ?? 'new'}`)
  plutôt qu'un `useEffect` de reset (évite la règle `react-hooks/set-state-in-effect`).
- Erreurs serveur (Supabase/RLS) : attrapées au submit → `toast.error(errorMessage(e))`.
- Modèle de référence : `src/features/sites/components/site-form-dialog.tsx`.
  (TanStack Form reste disponible si un formulaire complexe le justifie.)

## À NE PAS FAIRE

- ❌ Oublier `.throwOnError()` ; oublier le filtre `deleted_at`.
- ❌ `.single()` quand le vide est normal (→ `.maybeSingle()`).
- ❌ Mettre la session Supabase comme source de vérité dans Query ; `await` dans le callback `onAuthStateChange` (deadlock).
- ❌ Clés de query incomplètes (sans filtres) ; `staleTime: 0` global.
- ❌ Éditer `database.types.ts` à la main ; oublier de régénérer après migration.
- ❌ Recréer le client Supabase dans un composant ; oublier `unsubscribe()` au cleanup.
