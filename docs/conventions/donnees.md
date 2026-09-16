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
          .eq('site_id', filtres.siteId) // cloisonnement redondant avec la RLS
          .abortSignal(signal)
          .throwOnError(), // sinon l'erreur reste invisible pour Query
    }),
}
```

- **Toujours `.throwOnError()`** : sinon l'erreur reste dans `{ error }` et Query croit que tout va bien.
- **`.maybeSingle()`** (pas `.single()`) quand l'absence de ligne est un cas normal (RLS qui filtre → résultat vide, pas erreur).
- **Jamais de filtre `deleted_at`** : la colonne n'existe plus (hard-delete, migrations 034-036). Cf. `CLAUDE.md` → Doctrine backend, point 4.
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

- `npm run gen:types` (après `npx supabase login`) régénère `src/lib/database.types.ts` : c'est la voie normale, à relancer après chaque migration backend.
- **Une seule exception à l'édition manuelle** : tant qu'une migration n'est pas déployée en production, `gen:types` ne peut pas la voir. On édite alors le fichier **à la main, en pont**, et on régénère dès le déploiement. Toute autre édition manuelle est une erreur.
- Une fois généré : `createClient<Database>(...)` dans `src/lib/supabase.ts` → `.from()`/`.rpc()` entièrement typés. En attendant : cast explicite ponctuel.

## Upload de document = 3 étapes

(a) upload Storage → (b) insert `documents` (avec `site_id` !) → (c) insert dans la table de liaison. Un objet Storage n'est lisible qu'une fois rattaché.

## Formulaires (react-hook-form + Zod)

- Pattern projet : **react-hook-form** + `zodResolver(schema)` dans un `<Form {...form}>` (`@/components/ui/form`)
  posé autour d'un `FormDialog`. Schéma défini **au niveau module** (`schemas.ts`). Patron complet :
  skill `nouvelle-page`, référence `patrons-de-page.md`.
- Champs : briques **`@/components/common/fields/*`** branchées sur `control` + `name` ; l'erreur est rendue
  par `FormMessage` (lit le resolver Zod) — plus de `value`/`onChange`/`error`.
- Schéma à **TRANSFORM** (`z.string().transform` → number, `z.coerce`…) : `useForm<z.input, unknown, z.output>`
  (3 génériques) + `useSubmitDialog<z.output>`. Sinon `useForm<Values>` (2 génériques).
- Ré-initialiser un formulaire d'édition : **keyer** le composant (`key={dlg.dialogKey}` via `useEntityDialog`)
  plutôt qu'un `useEffect` de reset (évite la règle `react-hooks/set-state-in-effect`).
- Soumission + erreurs serveur : **`useSubmitDialog`** (`@/hooks/use-submit-dialog`) — `try/catch` → toast succès
  puis `close`, ou `toast.error(writeErrorMessage(e))` (dialog laissé ouvert).
- Composant impératif `value`/`onChange` (ex. `LocalEquipementFields`) : le ponter via `useWatch` + `form.setValue`.
- Modèle de référence : `src/features/sites/components/site-form-dialog.tsx` (+ `niveau`/`local` pour les transforms).

## Validation : le front ne doit jamais être plus permissif que la colonne

Le front présente, la base valide — mais une saisie que la base refusera doit être refusée **avant** l'aller-retour réseau, sinon l'utilisateur récolte un `23514` ou un `22003` brut qui ne désigne aucun champ.

### Le garde-fou automatique

`src/lib/concordance-sql.test.ts` **sonde** chaque schéma Zod avec des valeurs dérivées mécaniquement des contraintes réelles de la production, et échoue si le schéma les accepte. Son oracle est `src/lib/contraintes-sql.json`, instantané de `information_schema` + `pg_constraint` — **jamais** `schema_complete.sql`, qui avait dérivé et avait rendu mort-né un premier jet de ce test.

| Commande                         | Ce qu'elle fait                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run contraintes:instantane` | Régénère l'instantané depuis la production (lecture seule). **Après chaque migration.**    |
| `npm run contraintes:verifier`   | Relit la production et échoue si l'instantané a dérivé. **Au déploiement**, hors `verify`. |
| `npm run test`                   | Rejoue les sondes hors ligne. C'est ce qui devient rouge quand un schéma ment.             |

Ce qu'il couvre : `length(trim(col)) > 0`, `length(col) <= N`, `col > v` / `>= v`, `col ~ 'regexp'`, `col = ANY (ARRAY[…])`, le débordement d'un `NUMERIC(p,s)` et celui d'un `SMALLINT`/`INTEGER`. Ce qu'il **ne** couvre **pas** : les CHECK inter-colonnes (déclarés un par un dans le test avec leur raison), les CHECK structurels (JSONB, chemins d'image), le `NOT NULL`, l'unicité, les FK, la RLS et les triggers. La liste détaillée est en tête du fichier de test — la lire avant de conclure qu'un champ est protégé.

Une contrainte CHECK ajoutée en production sur une table de formulaire rend le test rouge tant qu'elle n'est pas soit sondée, soit déclarée non sondable avec sa raison. C'est voulu : le danger d'un tel test n'est pas qu'il échoue, c'est qu'il rassure.

### Un schéma Zod hors de `schemas.ts` est un schéma hors filet

Le test ci-dessus ne sonde que des schémas **exportés depuis un module**. Un `z.object({…})` déclaré en ligne dans un `.tsx` lui est invisible — et ce sont précisément ces schémas-là qui portaient les divergences de bornes de l'audit de septembre 2026. Sept vivent encore ainsi : `common/motif-dialog`, `documents/document-edit-dialog`, `equipements/equipement-parc-dialog`, `equipements/parc-sous-categorie-dialog`, `ordres-travail/date-prevue-dialog`, `utilisateurs/utilisateur-identite-card`, `routes/_app/profil.tsx`.

**Règle** : tout schéma de formulaire vit dans le `schemas.ts` de sa feature et y est **exporté**. Une modale de brique commune, qui ne peut dépendre d'aucune feature (`motif-dialog`), garde son schéma local mais l'**exporte** quand même, pour rester sondable.

### Un helper de validation ne se factorise que s'il a les mêmes bornes

Trois `optionalNumber` homonymes coexistent dans `localisations/`, `gammes/` et `modeles-operations/`. Ce n'est **pas** une duplication à corriger : ils ne valident pas la même chose.

| Copie                | Ce qu'elle valide        | Négatif ?                                                       |
| -------------------- | ------------------------ | --------------------------------------------------------------- |
| `localisations`      | une surface, une hauteur | **Non** — `CHECK (surface_m2 > 0)`                              |
| `gammes`             | un seuil de mesure       | **Oui** — une chambre froide se contrôle entre −25 °C et −18 °C |
| `modeles-operations` | un seuil de mesure       | **Oui** — même notion que ci-dessus                             |

Les fusionner remettrait des bornes fausses sur deux écrans. `localisations/schemas.ts` porte en plus un `ordreNiveau` distinct, parce qu'un sous-sol se numérote `-1`. **La cause racine n'est pas toujours une brique manquante ; parfois c'est une brique de trop.** Avant de mutualiser un helper de validation, comparer les bornes des colonnes visées — pas la forme du code.

### Limite connue : `prepareChamps` n'est pas sur tous les chemins d'écriture

`prepareChamps` (`src/lib/champs.ts`) nettoie les caractéristiques libres et refuse celles qui dépassent 9 500 caractères sérialisés — marge sous le `CHECK (length(specifications::text) < 10000)` que portent `equipements` et `modeles_equipements`.

Quatre chemins écrivent une de ces deux colonnes **sans** passer par lui ni par un contrôle de taille équivalent (état au 16/09/2026) : `features/equipements/mutations.ts` (l'INSERT et l'UPDATE d'un équipement), `features/modeles-equipements/mutations.ts` (l'INSERT d'un modèle depuis le formulaire) et `features/modeles-equipements/components/import-csv-dialog.tsx`. Sur ces quatre-là, un gabarit volumineux remonte un `23514` brut. Les autres chemins sont couverts, soit par `prepareChamps` (`parc-sous-categorie-dialog`, `type-local-gabarit-dialog`, `modele-equipement-detail`), soit par le contrôle de taille explicite de la propagation (`equipements/mutations.ts`, marge à 9 000).

`categories`, `locaux` et `types_locaux` ne portent **aucune** borne de taille sur `specifications` : le garde-fou y est une politique d'interface, pas un miroir de la base.

## À NE PAS FAIRE

- ❌ Oublier `.throwOnError()` ; filtrer sur `deleted_at` (colonne supprimée).
- ❌ `.single()` quand le vide est normal (→ `.maybeSingle()`).
- ❌ Mettre la session Supabase comme source de vérité dans Query ; `await` dans le callback `onAuthStateChange` (deadlock).
- ❌ Clés de query incomplètes (sans filtres) ; `staleTime: 0` global.
- ❌ Éditer `database.types.ts` à la main **hors du cas du pont** ci-dessus ; oublier de régénérer après déploiement.
- ❌ Recréer le client Supabase dans un composant ; oublier `unsubscribe()` au cleanup.
- ❌ Déclarer un `z.object({…})` de formulaire **en ligne dans un `.tsx`** : il échappe au test de concordance.
- ❌ Recopier une borne SQL **à la main** dans un commentaire ou un test comme oracle : la source est `contraintes-sql.json`, régénéré.
- ❌ Fusionner deux helpers de validation homonymes sans avoir comparé les bornes des **colonnes** qu'ils visent.
