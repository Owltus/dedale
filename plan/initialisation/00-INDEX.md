# Plan d'implémentation — GMAO Desktop

## Vue d'ensemble

L'application est découpée en **13 phases** séquentielles. Chaque phase produit un livrable fonctionnel testable. Les phases sont ordonnées par dépendance : chaque phase ne dépend que des phases précédentes.

## Phases

| # | Fichier | Phase | Dépend de | Livrable |
|---|---------|-------|-----------|----------|
| 0 | [00-scaffolding.md](./00-scaffolding.md) | Scaffolding projet | — | App Tauri qui se lance avec une page blanche |
| 1 | [01-backend-core.md](./01-backend-core.md) | Backend Rust (fondations) | Phase 0 | Connexion SQLite + init schema + commandes CRUD de base |
| 2 | [02-frontend-foundation.md](./02-frontend-foundation.md) | Frontend (fondations) | Phase 0 | Layout, sidebar, routing, composants partagés |
| 3 | [03-referentiels.md](./03-referentiels.md) | Paramètres & référentiels | Phases 1, 2 | Page paramètres avec CRUD pour toutes les tables de référence |
| 4 | [04-structure-operationnelle.md](./04-structure-operationnelle.md) | Structure opérationnelle | Phase 3 | Localisations (arbre), Domaines, Familles, Équipements |
| 5 | [05-prestataires-contrats.md](./05-prestataires-contrats.md) | Prestataires & Contrats | Phase 3 | CRUD prestataires, contrats, avenants, liaisons gammes |
| 6 | [06-gammes.md](./06-gammes.md) | Gammes de maintenance | Phases 4, 5 | Gammes, opérations, gammes types, associations |
| 7 | [07-ordres-travail.md](./07-ordres-travail.md) | Ordres de travail | Phase 6 | OT complet : CRUD, opérations d'exécution, workflow statuts |
| 8 | [08-demandes-intervention.md](./08-demandes-intervention.md) | Demandes d'intervention | Phases 4, 6 | DI, modèles, liaisons gammes/localisations |
| 9 | [09-documents.md](./09-documents.md) | Système documentaire | Phases 5, 6, 7, 8 | Upload, liaison multi-entités, nettoyage orphelins |
| 10 | [10-dashboard-planning.md](./10-dashboard-planning.md) | Dashboard & Planning | Phases 7, 8 | Dashboard proactif, KPIs, alertes, vue calendrier |
| 11 | [11-transversaux.md](./11-transversaux.md) | Fonctions transversales | Phase 10 | Recherche globale, export/impression, notifications système |
| 12 | [12-polish.md](./12-polish.md) | Finitions | Phase 11 | Onboarding, empty states, optimistic updates, tests E2E |

## Règles de développement

Lire **PRD-STACK.md** pour les 9 règles Claude Code. Les plus critiques :
1. Toute logique métier côté Rust — jamais dans le frontend
2. TanStack Query pour TOUS les appels `invoke()`
3. Zod pour TOUTE validation frontend
4. shadcn/ui pour tous les composants (voir PRD-FRONTEND.md § "Composants : shadcn/ui vs custom")
5. SQL brut uniquement — pas d'ORM

## Arborescence cible

```
src/
├── components/
│   ├── ui/              # shadcn/ui (copié par CLI)
│   ├── layout/          # Sidebar, PageHeader, Breadcrumb
│   ├── shared/          # DataTable, DocumentsLies, SeuilDisplay, etc.
│   └── domain/          # Composants spécifiques par domaine
├── pages/
│   ├── dashboard/
│   ├── planning/
│   ├── ordres-travail/
│   ├── gammes/
│   ├── gammes-types/
│   ├── equipements/
│   ├── localisations/
│   ├── prestataires/
│   ├── contrats/
│   ├── techniciens/
│   ├── demandes/
│   ├── documents/
│   └── parametres/
├── hooks/               # useInvoke, useTanstackQuery wrappers
├── lib/
│   ├── schemas/         # Zod schemas par domaine
│   ├── types/           # Types TS miroir des structs Rust
│   └── utils/           # formatDate, formatBytes, etc.
├── App.tsx
├── main.tsx
└── router.tsx

src-tauri/
├── src/
│   ├── commands/        # 1 fichier par domaine
│   ├── models/          # 1 fichier par domaine (structs Rust)
│   ├── db.rs            # Connexion + init SQLite
│   ├── lib.rs           # Registration des commandes
│   └── main.rs          # Point d'entrée Tauri
└── Cargo.toml
```
