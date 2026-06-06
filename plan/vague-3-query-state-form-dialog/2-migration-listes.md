# Étape 2 — Migration des écrans liste

## Objectif

Remplacer le bloc des 4 états recopié par `<QueryState>` + `<CardSkeletons>` sur
les écrans liste standard, sans changer le rendu.

## Fichier(s) impacté(s)

Écrans à migrer (4 états standard) :

- `src/routes/_app/gammes.tsx`
- `src/routes/_app/equipements.tsx`
- `src/routes/_app/ordres-travail.tsx`
- `src/routes/_app/demandes.tsx`
- `src/routes/_app/chantiers.tsx`
- `src/routes/_app/prestataires.tsx`
- `src/routes/_app/releves.tsx`
- `src/routes/_app/investissements.tsx`
- `src/routes/_app/sites.tsx`
- `src/routes/_app/localisations.tsx` (3 vues drill-down — au cas par cas)
- `src/routes/_app/utilisateurs.tsx` (liste + `enabled` — au cas par cas)
- `src/components/common/documents-tab.tsx`

Hors périmètre (atypiques) : `registre.tsx` (table + onglets), `planning.tsx`
(grille custom), `dashboard/*` (mini-listes).

## Travail à réaliser

### 1. Schéma de remplacement

Avant (typique) :

```tsx
{isPending ? (
  <div className={cardGrid.default}>
    {Array.from({ length: 4 }).map((_, i) => (
      <Skeleton key={i} className="h-40" />
    ))}
  </div>
) : isError ? (
  <ErrorState onRetry={() => void refetch()} />
) : items.length === 0 ? (
  <EmptyState icon={X} title="…" description="…" action={newButton} />
) : (
  <div className={cardGrid.default}>{items.map((it) => <Card …/>)}</div>
)}
```

Après :

```tsx
<QueryState
  query={query}
  pending={<CardSkeletons count={4} height="h-40" />}
  empty={<EmptyState icon={X} title="…" description="…" action={newButton} />}
>
  {(items) => (
    <div className={cardGrid.default}>{items.map((it) => <Card …/>)}</div>
  )}
</QueryState>
```

Important :

- Conserver le `query` complet (ne plus déstructurer `data/isPending/isError`).
  Si l'écran utilisait `const { data = [] } = useQuery(...)`, passer désormais
  `const query = useQuery(...)` et utiliser `query` dans `QueryState`.
- **Reprendre EXACTEMENT** `count`/`height` des squelettes d'origine, l'icône,
  les textes de l'EmptyState et l'`action`.
- **Recherche / double EmptyState** : le filtrage et le « aucun résultat » restent
  dans la render-prop :
  ```tsx
  {(items) => {
    const filtered = items.filter(matchSearch)
    if (filtered.length === 0) return <EmptyState … title="Aucun résultat" />
    return <div className={cardGrid.default}>{filtered.map(…)}</div>
  }}
  ```
  (le champ de recherche, affiché conditionnellement avant, garde sa logique.)
- **Multi-requêtes** (chantiers+statuts, investissements+statuts, documents+types,
  localisations locaux+types) : `QueryState` pilote la requête PRINCIPALE (la
  liste) ; les requêtes de lookup restent en `useQuery` à côté et sont utilisées
  dans la render-prop.
- `localisations` (3 vues) et `utilisateurs` : appliquer le même schéma si le bloc
  est standard ; si le `enabled`/drill-down complique, laisser tel quel et le
  signaler.

### 2. Nettoyage

Retirer les imports devenus inutiles (`Skeleton` si plus utilisé directement,
`ErrorState` si plus référencé hors QueryState). Garder `EmptyState`,
`cardGrid`, `Card`.

## Critère de validation

- `npx tsc -b`, `npx eslint .`, `npx vite build` passent.
- Rendu identique : mêmes squelettes (nombre/hauteur), mêmes EmptyState (icône,
  titres, descriptions, action), mêmes grilles, mêmes recherches.
- États error toujours avec retry. Multi-requêtes inchangées.
