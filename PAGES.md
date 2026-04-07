# DÉDALE — Cartographie des pages

## Arborescence des pages

```
/                                    Tableau de bord             ← Dashboard()               dashboard/index.tsx
│
├── /planning                        Planning (Gantt)            ← Planning()                planning/index.tsx
│
├── /ordres-travail                  Liste des OT                ← OrdresTravailList()       ordres-travail/index.tsx
│   └── /ordres-travail/:id          Détail OT                   ← OrdresTravailDetail()     ordres-travail/[id].tsx
│
├── /gammes                          Domaines gammes             ← GammesList()              gammes/index.tsx
│   ├── /gammes/domaines/:id         Familles d'un domaine       ← GammesDomaine()           gammes/domaines/[idDomaine].tsx
│   ├── /gammes/familles/:id         Gammes + OT d'une famille   ← GammesFamille()           gammes/familles/[idFamille].tsx
│   └── /gammes/:id                  Détail gamme                ← GammesDetail()            gammes/[id].tsx
│
├── /gammes-types                    Liste gammes types           ← GammesTypesList()         gammes-types/index.tsx
│   └── /gammes-types/:id            Détail gamme type            ← GammesTypesDetail()       gammes-types/[id].tsx
│
├── /equipements                     Domaines équipements        ← Equipements()             equipements/index.tsx
│   ├── /equipements/domaines/:id    Familles d'un domaine       ← DomaineDetail()           equipements/domaines/[idDomaine].tsx
│   ├── /equipements/familles/:id    Équipements d'une famille   ← FamilleDetail()           equipements/familles/[idFamille].tsx
│   └── /equipements/:id             Détail équipement           ← EquipementDetail()        equipements/[id].tsx
│
├── /localisations                   Bâtiments                   ← Localisations()           localisations/index.tsx
│   ├── /localisations/batiments/:id Niveaux d'un bâtiment       ← BatimentDetail()          localisations/batiments/[idBatiment].tsx
│   └── /localisations/niveaux/:id   Locaux d'un niveau          ← NiveauDetail()            localisations/niveaux/[idNiveau].tsx
│
├── /prestataires                    Liste prestataires           ← PrestatairesList()        prestataires/index.tsx
│   └── /prestataires/:id            Détail prestataire           ← PrestatairesDetail()      prestataires/[id].tsx
│
├── /techniciens                     Liste techniciens            ← Techniciens()             techniciens/index.tsx
│
├── /demandes                        Liste DI                     ← DemandesList()            demandes/index.tsx
│   └── /demandes/:id                Détail DI                    ← DemandesDetail()          demandes/[id].tsx
│
├── /documents                       Liste documents              ← Documents()               documents/index.tsx
│
└── /parametres                      Paramètres                   ← Parametres()              parametres/index.tsx
    └── /parametres/etablissement    Fiche établissement          ← Etablissement()           parametres/etablissement.tsx
```

## Correspondance fichiers / pages

| Route | Fichier | Nom usuel |
|-------|---------|-----------|
| `/` | `pages/dashboard/index.tsx` | Tableau de bord |
| `/planning` | `pages/planning/index.tsx` | Planning |
| `/ordres-travail` | `pages/ordres-travail/index.tsx` | Liste OT |
| `/ordres-travail/:id` | `pages/ordres-travail/[id].tsx` | Détail OT |
| `/gammes` | `pages/gammes/index.tsx` | Domaines gammes |
| `/gammes/domaines/:id` | `pages/gammes/domaines/[idDomaine].tsx` | Familles d'un domaine |
| `/gammes/familles/:id` | `pages/gammes/familles/[idFamille].tsx` | Gammes d'une famille |
| `/gammes/:id` | `pages/gammes/[id].tsx` | Détail gamme |
| `/gammes-types` | `pages/gammes-types/index.tsx` | Liste gammes types |
| `/gammes-types/:id` | `pages/gammes-types/[id].tsx` | Détail gamme type |
| `/equipements` | `pages/equipements/index.tsx` | Domaines équipements |
| `/equipements/domaines/:id` | `pages/equipements/domaines/[idDomaine].tsx` | Familles d'un domaine |
| `/equipements/familles/:id` | `pages/equipements/familles/[idFamille].tsx` | Équipements d'une famille |
| `/equipements/:id` | `pages/equipements/[id].tsx` | Détail équipement |
| `/localisations` | `pages/localisations/index.tsx` | Bâtiments |
| `/localisations/batiments/:id` | `pages/localisations/batiments/[idBatiment].tsx` | Niveaux d'un bâtiment |
| `/localisations/niveaux/:id` | `pages/localisations/niveaux/[idNiveau].tsx` | Locaux d'un niveau |
| `/prestataires` | `pages/prestataires/index.tsx` | Liste prestataires |
| `/prestataires/:id` | `pages/prestataires/[id].tsx` | Détail prestataire |
| `/techniciens` | `pages/techniciens/index.tsx` | Liste techniciens |
| `/demandes` | `pages/demandes/index.tsx` | Liste DI |
| `/demandes/:id` | `pages/demandes/[id].tsx` | Détail DI |
| `/documents` | `pages/documents/index.tsx` | Liste documents |
| `/parametres` | `pages/parametres/index.tsx` | Paramètres |
| `/parametres/etablissement` | `pages/parametres/etablissement.tsx` | Fiche établissement |

## Annexe — Composants réutilisables

### Layout (`components/layout/`)

| Composant | Rôle |
|-----------|------|
| `RootLayout` | Conteneur principal (sidebar + zone contenu) |
| `Sidebar` | Barre de navigation latérale (3 sections, recherche globale) |
| `PageHeader` | En-tête de page avec titre + boutons d'action |
| `BreadcrumbContext` | Fil d'Ariane dynamique |
| `ErrorBoundary` | Capture d'erreurs React |

### Partagés (`components/shared/`)

| Composant | Rôle |
|-----------|------|
| `OtList` | Liste de cartes OT (recherche, filtre date, statut, document) |
| `GammeList` | Liste de cartes gammes (recherche, statut synthétique, document) |
| `InlineTable` | Tableau générique inline (colonnes, tri, état vide) |
| `DataTable` | Tableau avancé avec TanStack Table |
| `ActionButtons` | Boutons edit/delete dans une ligne de table |
| `HeaderButton` | Bouton icône dans un PageHeader (avec tooltip) |
| `CrudDialog` | Dialog formulaire create/edit |
| `ConfirmDialog` | Dialog de confirmation de suppression |
| `ContratDialogs` | Dialogs spécifiques contrats (edit, résiliation, avenant) |
| `InfoCard` | Fiche info compacte (grille InfoItem) |
| `InfoItem` | Paire label/valeur dans une InfoCard |
| `StatusBadge` | Badges statut : OtStatusBadge, GammeStatusBadge, DiStatusBadge, ContratStatusBadge, PrioriteBadge |
| `OtGammeCell` | Cellule nom gamme dans un OT (indicateur retard + barré si annulé) |
| `EmptyState` | État vide avec icône et message |
| `SearchInput` | Input de recherche avec debounce |
| `DateRangePicker` | Sélecteur de plage de dates (masque saisie + calendrier ISO FR) |
| `SelectSearch` | Combobox recherchable (Popover + Command) |
| `FilterSelect` | Select de filtre simple |
| `FilterToggle` | Toggle on/off pour filtres |
| `DocumentsLies` | Liaison documents multi-entités (upload, suppression) |
| `LocalisationCascadeSelect` | Sélection en cascade bâtiment → niveau → local |
| `StatCard` | Carte statistique (dashboard) |
| `DescriptionList` | Liste de description (dl/dt/dd) |
| `TreeView` | Arborescence récursive |
| `CommandPalette` | Palette de commandes (Ctrl+K) |
