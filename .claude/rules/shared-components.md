# Règles composants partagés

## Composants disponibles (`src/components/shared/`)

| Composant | Quand l'utiliser |
|-----------|-----------------|
| `InlineTable` | **TOUTE** liste de données (remplace `<table>` inline) |
| `ActionButtons` | Boutons edit/delete dans une ligne de table |
| `EmptyState` | État vide (utilisé automatiquement par InlineTable) |
| `HeaderButton` | **TOUT** bouton icon dans un `PageHeader` (remplace Tooltip+Button) |
| `CrudDialog` | **TOUT** dialog avec formulaire create/edit (remplace Dialog+form+DialogFooter) |
| `ConfirmDialog` | **TOUTE** confirmation de suppression |
| `InfoCard` | Fiche info compacte en haut des pages détail (props: `items`, `imageId?`) |
| `StatusBadge` | Badge coloré pour statuts OT, priorités, statuts DI, statuts contrats |
| `OtGammeCell` | Cellule nom gamme dans une table OT (indicateur retard + barré si annulé) |
| `DocumentsLies` | Liaison documents multi-entités |
| `LocalisationCascadeSelect` | Sélection en cascade bâtiment → niveau → local |

## Règles d'utilisation

- **JAMAIS** de `<table>` inline dans une page — utiliser `InlineTable`
- **JAMAIS** de `Tooltip + TooltipTrigger + Button` dans un header — utiliser `HeaderButton`
- **JAMAIS** de `Dialog + DialogContent + form + DialogFooter` pour un CRUD — utiliser `CrudDialog`
- **JAMAIS** de `Inbox + h3 + p` pour un état vide — utiliser `EmptyState` (ou `InlineTable.emptyTitle`)
- **JAMAIS** de `getStatutOt()` + `<Badge>` inline — utiliser `OtStatusBadge`
- **JAMAIS** de `Card + CardContent + grid` pour une fiche info — utiliser `InfoCard` avec prop `items`
- **JAMAIS** de `Pencil + Trash2` boutons inline dans une table — utiliser `ActionButtons`

## Quand créer un nouveau composant partagé

Un pattern mérite d'être extrait si :
1. Il apparaît dans **3+ fichiers**
2. Il fait **>10 lignes** de JSX identique
3. Son extraction **ne perd pas de contexte** (pas de sur-abstraction)

Placer dans `src/components/shared/`, named export, pas de `export default`.
