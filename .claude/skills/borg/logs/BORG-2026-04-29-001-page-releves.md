# BORG-2026-04-29-001 — Audit pré-implémentation page « Relevés »

> Projet : DÉDALE (GMAO Tauri v2 + React + TS + SQLite, mono-utilisateur)
> Drones déployés : Trois-de-Cinq, Sept-de-Neuf, Deux-de-Cinq, Quatre-de-Cinq, Six-de-Neuf
> Mode : DIAGNOSTIC

## Cible

Préparer l'implémentation d'une nouvelle page « Relevés » :
- `/releves` : liste des gammes ayant au moins une opération de type Mesure (id_type_operation = 4)
- `/releves/[id_gamme]` : graphes time-series small multiples (un par opération mesure de la gamme)
- Filtre période : 12 mois par défaut + bouton « Tout »
- Clic sur point → navigation vers OT correspondant
- Affichage des seuils min/max sur chaque graphe

## Rapports des drones

### Drone 1 — Trois-de-Cinq (Cartographe)

ZONE 1 — Bibliothèques graphiques :
- `package.json` : react-chartjs-2 5.3.1 + chart.js 4.5.1 (seule stack)
- Usages : src/pages/dashboard/PlanningChart.tsx (Bar stacké), OtDonutChart.tsx (Donut), ContratsTimeline.tsx (SVG manuel)
- Aucun composant time-series réutilisable

ZONE 2 — Pattern liste + détail :
- Pages OT, Gammes, Demandes suivent le même pattern
- Structure : PageHeader + useInvokeQuery + InfoCard + Tabs
- Hooks dans src/hooks/use-{domaine}.ts

ZONE 3 — Routing + sidebar :
- Routes : src/router.tsx (lazy imports)
- SidebarNav.tsx : NAV_SECTIONS avec 2 sections (Opérationnel + Référentiels)
- Ajout : 1 ligne router + 1 item NAV_SECTIONS + 2 fichiers pages

### Drone 2 — Sept-de-Neuf (Conformité Backend)

ZONE A — Helpers SQL réutilisables :
- src-tauri/src/commands/helpers/ot_list.rs (query_ot_list, query_ot_list_by_ids)
- sql_dates.rs (LUNDI_COURANT, LUNDI_PROCHAIN)
- Pattern fetch_ot_detail() ligne 124 ordres_travail.rs
- get_operations_historique() ligne 209 — précédent pour joins historique

ZONE B — Schéma SQL :
- types_operations : Mesure = id 4, necessite_seuils=1
- operations(id_gamme, id_type_operation, seuils, id_unite)
- operations_execution(id_ordre_travail, id_type_source, id_source, valeur_mesuree, est_conforme, date_execution, unite_symbole)
- ordres_travail(id_gamme, date_prevue, date_cloture, id_statut_ot)
- gammes(id, nom_gamme, id_famille_gamme)

ZONE C — Index couvrants :
- idx_operations_gamme(id_gamme)
- idx_ops_exec_source_composite(id_type_source, id_source, id_ordre_travail)
- idx_ops_exec_ordre(id_ordre_travail)
- idx_ot_gamme_statut_date(id_gamme, id_statut_ot, date_prevue)
- Aucun nouvel index requis

ZONE D — Migrations :
- 001_initial_schema.sql, 002_image_libre_sur_ot_terminaux.sql, 003_parametres_systeme.sql
- Prochain numéro : 004 (mais aucune migration nécessaire pour cette feature)

### Drone 3 — Deux-de-Cinq (Composants)

À réutiliser : EmptyState, InfoCard, StatCard, HeaderButton, ActionButtons, ConfirmDialog, CrudDialog, CardList, DateRangePicker, DescriptionList, LocalisationCascadeSelect.

Layout : PageHeader, useSetBreadcrumbTrail.

Hooks data : useInvokeQuery, useInvokeMutation, useGammes, useGamme, useFamilleGamme, useDomaineGamme, useOperationsHistorique.

Patterns : flex h-full flex-col p-4 gap-3 overflow-hidden / PageHeader + InfoCard + Tabs / scroll zones flex-1 min-h-0.

### Drone 4 — Quatre-de-Cinq (Failles)

ZONE A — Triggers :
- gestion_statut_ot, protection_operations_ot_terminaux, protection_ot_terminaux : aucun impact pour SELECT pur

ZONE B — Conventions non négociables :
- TanStack Query partout (jamais invoke nu)
- Re-requête après mutations (triggers latents)
- prepare_cached() obligatoire
- Zod miroir CHECK SQL (NA pour lecture seule)

ZONE C — Pièges UI :
- Select avec items= obligatoire si IDs numériques
- HeaderButton (pas Tooltip+Button inline)

ZONE D — Performance :
- Index requis : déjà présents

### Drone 5 — Six-de-Neuf (Contradicteur)

VERDICTS PARTIE A :
- Drone 4 D.2 (deadlock SQLite) : FAUX — pattern .collect::<Vec<_>>() respecté partout
- Drone 4 D.1 (table scan 500ms) : EXAGÉRÉ — index présents
- Drone 4 B.5 (InlineTable critique) : EXAGÉRÉ — convention, pas criticité

PARTIE B — Angles morts :
- Erreurs Tauri : pattern toast.error(String(e))
- Lazy loading : pattern lazy(() => import().then(m => ({ default: m.X })))
- date-fns 4.1.0 disponible (locale fr)
- Type Mesure id 4 confirmé hardcodé migration ligne 961
- ANGLE MORT UX : ventilation des unités hétérogènes dans la liste des gammes

## Verdict unifié

Voir Phase 4 dans la conversation principale.

## Actions exécutées

Diagnostic uniquement. Pas d'écriture de code dans cette phase.
