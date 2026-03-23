# Phase 0 — Scaffolding projet

## Objectif
Application Tauri v2 qui se lance, affiche une page React vide avec Tailwind + shadcn/ui initialisé.

## Dépendances
Aucune — c'est le point de départ.

## Étapes

### 0.1 Créer le projet Tauri v2

```bash
npm create tauri-app@latest gmao -- --template react-ts
cd gmao
```

### 0.2 Installer les dépendances frontend

```bash
# Core
npm install react-router-dom

# UI
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node

# shadcn/ui (via CLI)
npx shadcn@latest init

# Formulaires + validation
npm install react-hook-form @hookform/resolvers zod

# State / cache
npm install @tanstack/react-query

# Tables
npm install @tanstack/react-table

# Recherche globale
npm install cmdk

# Tauri
npm install @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
```

### 0.3 Configurer le backend Rust

`src-tauri/Cargo.toml` :
```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
```

### 0.4 Créer l'arborescence

```
mkdir -p src/components/ui
mkdir -p src/components/layout
mkdir -p src/components/shared
mkdir -p src/components/domain
mkdir -p src/pages
mkdir -p src/hooks
mkdir -p src/lib/schemas
mkdir -p src/lib/types
mkdir -p src/lib/utils
mkdir -p src-tauri/src/commands
mkdir -p src-tauri/src/models
```

### 0.5 Configurer Tailwind

`tailwind.config.js` : configuration standard avec les chemins shadcn/ui.

### 0.6 Installer les composants shadcn/ui de base

```bash
npx shadcn@latest add button badge card dialog input textarea select
npx shadcn@latest add alert alert-dialog dropdown-menu switch checkbox
npx shadcn@latest add separator tooltip tabs sheet progress
npx shadcn@latest add command popover calendar
```

### 0.7 Configurer TanStack Query

`src/main.tsx` : wrapper `<QueryClientProvider>` autour de `<App />`.

### 0.8 Vérifier le lancement

```bash
npm run tauri dev
```

## Critère de validation
- `npm run tauri dev` ouvre une fenêtre desktop
- La page affiche "GMAO" avec un style Tailwind
- Aucune erreur console
- Le build Rust compile sans erreur

## Fichiers créés
| Fichier | Rôle |
|---|---|
| `src/main.tsx` | Point d'entrée React + QueryClientProvider |
| `src/App.tsx` | Shell minimal |
| `tailwind.config.js` | Config Tailwind |
| `postcss.config.js` | Config PostCSS |
| `src-tauri/Cargo.toml` | Dépendances Rust |
| `src-tauri/src/main.rs` | Point d'entrée Tauri |
