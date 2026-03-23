# Phase 2 — Frontend (fondations)

## Objectif
Layout complet (sidebar groupée, zone principale, breadcrumb), routing React Router, composants partagés réutilisables, hook `useInvoke`.

## Dépend de
Phase 0 (scaffolding)

## Étapes

### 2.1 Router (`src/router.tsx`)

Toutes les routes du PRD-FRONTEND.md (voir table des routes). Lazy loading par page.

```tsx
const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "planning", element: <Planning /> },
      { path: "ordres-travail", element: <OrdresTravailList /> },
      { path: "ordres-travail/:id", element: <OrdresTravailDetail /> },
      { path: "gammes", element: <GammesList /> },
      { path: "gammes/:id", element: <GammesDetail /> },
      { path: "gammes-types", element: <GammesTypesList /> },
      { path: "gammes-types/:id", element: <GammesTypesDetail /> },
      { path: "equipements", element: <Equipements /> },
      { path: "equipements/:id", element: <EquipementDetail /> },
      { path: "localisations", element: <Localisations /> },
      { path: "prestataires", element: <PrestatairesList /> },
      { path: "prestataires/:id", element: <PrestatairesDetail /> },
      { path: "contrats", element: <ContratsList /> },
      { path: "contrats/:id", element: <ContratsDetail /> },
      { path: "techniciens", element: <Techniciens /> },
      { path: "demandes", element: <DemandesList /> },
      { path: "demandes/:id", element: <DemandesDetail /> },
      { path: "documents", element: <Documents /> },
      { path: "parametres", element: <Parametres /> },
      { path: "parametres/etablissement", element: <Etablissement /> },
    ],
  },
]);
```

### 2.2 Layout racine (`src/components/layout/`)

**Fichiers** :
- `RootLayout.tsx` — sidebar + zone principale + Toaster
- `Sidebar.tsx` — navigation groupée (Opérationnel / Référentiels / Système)
- `PageHeader.tsx` — titre + breadcrumb + actions
- `Breadcrumb.tsx` — fil d'Ariane automatique

La sidebar suit la structure du PRD-FRONTEND.md :
```
── Opérationnel ──
  Dashboard
  Planning
  Ordres de travail
  Demandes (DI)

── Référentiels ──
  Gammes
  Équipements
  Localisations
  Prestataires
  Contrats
  Techniciens
  Documents

── Système ──
  Paramètres
```

### 2.3 Hook `useInvoke` (`src/hooks/useInvoke.ts`)

Wrapper TanStack Query autour de `invoke()` :

```tsx
// Query (lecture)
export function useQuery<T>(command: string, params?: Record<string, unknown>) {
  return useTanstackQuery({
    queryKey: [command, params],
    queryFn: () => invoke<T>(command, params),
  });
}

// Mutation (écriture)
export function useMutation<T>(command: string) {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: (params: Record<string, unknown>) => invoke<T>(command, params),
    onError: (error) => {
      // Les erreurs trigger sont des strings — les afficher dans un toast
      toast.error(String(error));
    },
  });
}
```

### 2.4 Composants partagés (`src/components/shared/`)

| Composant | Fichier | Rôle | Priorité |
|---|---|---|---|
| `DataTable` | `DataTable.tsx` | Table TanStack avec tri, filtrage, pagination | **Critique** |
| `PageHeader` | `PageHeader.tsx` | Titre + breadcrumb + slot actions | Critique |
| `SearchInput` | `SearchInput.tsx` | Input de recherche avec debounce | Haute |
| `FilterSelect` | `FilterSelect.tsx` | Select pour filtres | Haute |
| `FilterToggle` | `FilterToggle.tsx` | Switch pour filtres booléens | Haute |
| `DateRangePicker` | `DateRangePicker.tsx` | 2x DatePicker pour plages | Haute |
| `SelectSearch` | `SelectSearch.tsx` | Combobox recherchable (Popover + Command) | Haute |
| `DescriptionList` | `DescriptionList.tsx` | Liste clé-valeur (dl/dt/dd) | Haute |
| `StatCard` | `StatCard.tsx` | Card KPI (label + valeur + variante) | Moyenne |
| `EmptyState` | `EmptyState.tsx` | État vide avec icône + message + CTA | Moyenne |
| `ConfirmDialog` | `ConfirmDialog.tsx` | AlertDialog de confirmation suppression | Moyenne |
| `CommandPalette` | `CommandPalette.tsx` | Ctrl+K recherche globale (cmdk) | Phase 11 |

### 2.5 Types TypeScript (`src/lib/types/`)

1 fichier par domaine. Les types miroir les structs Rust :

```
src/lib/types/
├── ordres-travail.ts
├── gammes.ts
├── equipements.ts
├── localisations.ts
├── prestataires.ts
├── contrats.ts
├── techniciens.ts
├── demandes.ts
├── documents.ts
├── referentiels.ts     # unités, périodicités, types, statuts, priorités
└── index.ts            # re-exports
```

### 2.6 Utilitaires (`src/lib/utils/`)

```
src/lib/utils/
├── format.ts          # formatDate, formatBytes, formatDuration
├── statuts.ts         # couleurs/labels par statut OT, opération, DI
└── cn.ts              # shadcn className merge (déjà généré par init)
```

## Fichiers créés

| Fichier | Rôle |
|---|---|
| `src/router.tsx` | Toutes les routes |
| `src/components/layout/RootLayout.tsx` | Shell principal |
| `src/components/layout/Sidebar.tsx` | Navigation groupée |
| `src/components/layout/PageHeader.tsx` | En-tête de page |
| `src/components/layout/Breadcrumb.tsx` | Fil d'Ariane |
| `src/components/shared/DataTable.tsx` | Table générique |
| `src/components/shared/SearchInput.tsx` | Recherche debounce |
| `src/components/shared/DescriptionList.tsx` | Liste clé-valeur |
| `src/components/shared/StatCard.tsx` | Card KPI |
| `src/components/shared/EmptyState.tsx` | État vide |
| `src/components/shared/ConfirmDialog.tsx` | Confirmation |
| `src/hooks/useInvoke.ts` | Hook TanStack Query + invoke |
| `src/lib/types/*.ts` | Types TS par domaine |
| `src/lib/utils/*.ts` | Utilitaires |

## Critère de validation
- Navigation entre toutes les routes (pages placeholder)
- Sidebar affiche les 3 groupes avec highlight de la route active
- Breadcrumb se met à jour automatiquement
- `DataTable` fonctionne avec des données mock (tri, pagination)
- `useQuery("ping")` affiche la version SQLite dans le dashboard placeholder
- Toaster fonctionne (toast.success / toast.error)
