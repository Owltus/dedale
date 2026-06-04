# 0001 — Fondations du front

- **Date** : 2026-06-04
- **Statut** : accepté

## Contexte

Le backend Supabase (PostgreSQL + Auth + Storage + RLS) est déjà déployé et porte toute la
logique métier. Il faut bâtir l'application front qui le consomme. Outil interne derrière
authentification : pas de besoin SEO/SSR.

## Décision

- **SPA** : Vite + React 19 + TypeScript (pas de SSR). La sécurité reste garantie par la RLS côté base.
- **Écosystème TanStack** : Router (routes file-based), Query (données + cache), Table, Form + Zod.
- **Tailwind CSS 4** pour le style ; `shadcn/ui` prévu pour les composants.
- **Auth** : `AuthProvider` (`src/auth.tsx`) tient la session via `onAuthStateChange` ; elle est
  injectée dans le `context` du routeur. Les routes protégées gardent via `beforeLoad`.
- **Port de dev fixe 5181** (`strictPort`) — le 5180 est occupé par un autre projet local.
- **Dépôt git propre** dédié au front, poussé sur `github.com/Owltus/dedale` (public).
  `contexte/` (doc interne + schéma backend) est **gitignoré** ; le schéma a son propre dépôt.

## Conséquences

- Pas de rendu serveur : tout passe par le client + la RLS. Une réponse vide n'est pas une erreur.
- Le front ne duplique pas la logique métier : il l'appelle (`from`/`rpc`) et présente.
- Le typage des données Supabase n'est pas encore généré ; à prévoir (types TS depuis le schéma)
  quand on attaquera le CRUD métier.
