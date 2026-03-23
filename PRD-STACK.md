# PRD — Stack Technique GMAO (Application Desktop)

## Contexte

Application de GMAO (Gestion de Maintenance Assistée par Ordinateur) desktop.
Mono-utilisateur, full local, aucun serveur distant.
La base de données SQLite existe déjà (schéma fourni séparément).

## Architecture globale

```
┌─────────────────────────────────────────┐
│              FRONTEND                    │
│                                         │
│  React + TypeScript                     │
│  Vite (bundler)                         │
│  Tailwind CSS (styling)                 │
│  shadcn/ui (composants UI)              │
│  React Router (navigation)              │
│  React Hook Form + Zod (formulaires)    │
│  TanStack Query (cache / state)         │
│                                         │
│         ↓ tauri::invoke()               │
├─────────────────────────────────────────┤
│              BACKEND (Rust)              │
│                                         │
│  Tauri v2 (conteneur desktop)           │
│  Commandes Tauri (#[tauri::command])    │
│  rusqlite (accès SQLite)                │
│  Logique métier en Rust                 │
│                                         │
│         ↓ SQL                           │
├─────────────────────────────────────────┤
│              STOCKAGE                    │
│                                         │
│  SQLite (base locale, fichier unique)   │
│                                         │
└─────────────────────────────────────────┘
```

## Stack détaillée

### Frontend

| Brique | Rôle | Pourquoi |
|---|---|---|
| **React 18+** | Framework UI | Écosystème mature, large base de composants |
| **TypeScript** | Typage statique | Sécurité du code, autocomplétion, maintenabilité |
| **Vite** | Bundler / dev server | Défaut de Tauri, rapide, HMR instantané |
| **Tailwind CSS** | Styling utilitaire | Rapide, cohérent, requis par shadcn/ui |
| **shadcn/ui** | Composants UI | Composants copiés dans le projet (pas de dépendance externe), basé sur Radix UI, CRUD-ready : tables, formulaires, modales, selects, date pickers |
| **React Router v6+** | Navigation | Routing entre les vues (équipements, interventions, stocks, planning, dashboard) |
| **React Hook Form** | Gestion formulaires | Performant, peu de re-renders, intégration native shadcn/ui |
| **Zod** | Validation de données | Schémas de validation typés, intégration React Hook Form via `@hookform/resolvers` |
| **TanStack Query v5** | Cache / état serveur | Cache les réponses des commandes Tauri, gère loading/error/refetch automatiquement |

### Backend (Rust)

| Brique | Rôle | Pourquoi |
|---|---|---|
| **Tauri v2** | Conteneur desktop | Binaire léger (~10 Mo), sécurisé, pont JS↔Rust natif |
| **Commandes Tauri** | API interne | Fonctions Rust exposées au frontend via `#[tauri::command]`, appelées par `invoke()` |
| **rusqlite** | Accès SQLite | SQL brut, pas d'ORM, mapping direct sur des structs Rust, simple et lisible |
| **serde** | Sérialisation | Convertit les structs Rust en JSON pour le frontend (requis par Tauri) |
| **serde_json** | JSON | Manipulation JSON quand nécessaire |

### Stockage

| Brique | Rôle | Pourquoi |
|---|---|---|
| **SQLite** | Base de données | Fichier unique, zéro config, parfait pour mono-utilisateur local |

## Flux de données

```
1. L'utilisateur interagit avec l'UI React
2. React appelle : await invoke("nom_commande", { params })
3. Tauri route vers la fonction Rust #[tauri::command]
4. La fonction Rust exécute la requête SQL via rusqlite
5. rusqlite retourne les données mappées sur des structs Rust
6. serde sérialise les structs en JSON
7. Le JSON est retourné au frontend
8. TanStack Query cache la réponse et met à jour l'UI React
```

## Contraintes techniques

- **Mono-utilisateur** : pas de gestion de sessions, pas d'auth
- **Full local** : aucun appel réseau, tout vit sur la machine
- **SQLite = source de vérité unique** : tout passe par rusqlite, jamais d'accès direct depuis le frontend
- **Le schéma SQLite existe déjà** : ne pas le modifier sans raison, les structs Rust doivent refléter le schéma existant
- **Toutes les requêtes SQL sont écrites à la main** : pas d'ORM, pas de query builder

## Dépendances à installer

### Frontend (npm)

```bash
# Core
npm install react react-dom react-router-dom
npm install -D typescript @types/react @types/react-dom

# UI
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node

# shadcn/ui (via CLI)
npx shadcn@latest init

# Formulaires + validation
npm install react-hook-form @hookform/resolvers zod

# State / cache
npm install @tanstack/react-query

# Tauri
npm install @tauri-apps/api @tauri-apps/cli
```

### Backend (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
```

## Règles pour Claude Code

1. **Toujours séparer commandes Rust et UI React** : jamais de logique métier dans le frontend
2. **1 fichier = 1 domaine** dans `commands/` et `models/`
3. **Toutes les commandes Tauri retournent `Result<T, String>`** pour une gestion d'erreur uniforme
4. **Les types TypeScript doivent miroir les structs Rust** : même noms de champs, mêmes types
5. **TanStack Query pour TOUS les appels invoke()** : jamais de invoke() nu dans un composant
6. **shadcn/ui pour TOUS les composants UI** : ne pas réinventer de composants
7. **Zod pour TOUTE validation côté frontend** avant d'envoyer au Rust
8. **SQL brut uniquement** : pas de query builder, pas d'ORM
9. **Commentaires en français** dans le code
