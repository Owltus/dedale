# Kit composants réutilisables

## Contexte

Les pages de l'app répètent les mêmes patterns : table inline sticky, empty state Inbox, dialog CRUD, boutons action icon. Ce refactoring extrait ces patterns en composants modulaires et migre toutes les pages existantes.

## Composants à créer

### 1. `<EmptyState>` — État vide
Remplace les 15+ blocs `Inbox + h3 + p` dupliqués.

```tsx
interface EmptyStateProps {
  title: string;
  description?: string;
}
```

### 2. `<InlineTable>` — Table inline standardisée
Remplace toutes les tables inline (thead sticky, hover rows, empty state).

```tsx
interface Column<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;  // ex: "w-28" pour largeur fixe
}

interface InlineTableProps<T> {
  columns: Column<T>[];
  data: T[];
  getKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => React.ReactNode;  // boutons edit/delete
  emptyTitle?: string;
  emptyDescription?: string;
}
```

### 3. `<CrudDialog>` — Dialog create/edit unifié
Remplace les dialogs useForm + zodResolver dupliqués.

```tsx
interface CrudDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;  // champs du formulaire
  onSubmit: () => void;
  submitLabel?: string;
}
```

### 4. `<ActionButtons>` — Boutons action inline
Remplace les `<div className="flex items-center justify-end gap-1">` avec Pencil/Trash2.

```tsx
interface ActionButtonsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  extra?: React.ReactNode;  // boutons supplémentaires
}
```

## Pages à migrer

| Page | Composants utilisés |
|------|-------------------|
| `gammes/index.tsx` | InlineTable, CrudDialog, EmptyState |
| `gammes/domaines/[idDomaine].tsx` | InlineTable, CrudDialog, EmptyState, ActionButtons |
| `gammes/familles/[idFamille].tsx` | InlineTable, CrudDialog, EmptyState |
| `gammes/[id].tsx` | InlineTable (onglets OT, ops, modèles, équipements), EmptyState |
| `gammes-types/index.tsx` | InlineTable, CrudDialog, EmptyState |
| `gammes-types/[id].tsx` | InlineTable, CrudDialog, EmptyState, ActionButtons |
| `equipements/index.tsx` | InlineTable, CrudDialog, EmptyState, ActionButtons |
| `equipements/domaines/[idDomaine].tsx` | InlineTable, CrudDialog, EmptyState, ActionButtons |
| `equipements/familles/[idFamille].tsx` | InlineTable, CrudDialog, EmptyState, ActionButtons |
| `equipements/[id].tsx` | InlineTable (OT + gammes liées), EmptyState |
| `localisations/index.tsx` | InlineTable, CrudDialog, EmptyState, ActionButtons |
| `localisations/batiments/[idBatiment].tsx` | InlineTable, CrudDialog, EmptyState, ActionButtons |
| `localisations/niveaux/[idNiveau].tsx` | InlineTable, CrudDialog, EmptyState, ActionButtons |
| `ordres-travail/index.tsx` | InlineTable, EmptyState |
| `demandes/index.tsx` | InlineTable, CrudDialog, EmptyState |
| `prestataires/index.tsx` | InlineTable, CrudDialog, EmptyState |
| `prestataires/[id].tsx` | InlineTable (contrats), EmptyState |
| `techniciens/index.tsx` | InlineTable, CrudDialog, EmptyState, ActionButtons |
| `documents/index.tsx` | InlineTable, EmptyState, ActionButtons |
| `parametres/CrudTab.tsx` | InlineTable, EmptyState, ActionButtons |

## Étapes

1. Créer les 4 composants dans `src/components/shared/`
2. Migrer les pages simples (listes sans onglets) : gammes/index, equipements/index, localisations/index, etc.
3. Migrer les pages intermédiaires (domaines, familles, batiments, niveaux)
4. Migrer les pages complexes (gammes/[id], prestataires/[id], OT detail)
5. Migrer parametres/CrudTab
6. Vérification TypeScript + visuelle
