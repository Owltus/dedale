# Étape 2 — Layout applicatif & navigation

## Objectif

La coquille de l'app : une route de layout protégée commune (sidebar + header), la navigation
groupée (Opérationnel / Référentiels), une page 404, et une nav **adaptée au rôle**.

## Fichier(s) impacté(s)

- `src/routes/_app.tsx` (nouveau — pathless layout protégé : garde `beforeLoad` + `<Outlet/>`)
- `src/routes/__root.tsx` (404 via `notFoundComponent`)
- `src/components/common/` : `AppSidebar`, `AppHeader`, `PageHeader`, `NavItem`
- déplacer l'accueil actuel sous `_app/`

## Travail à réaliser

1. Route `_app.tsx` : `beforeLoad` qui exige la session (factorise la garde de `index`/futurs écrans).
2. Sidebar repliable, deux groupes (cf. `doc-fonctionnelle/README.md`) :
   - **Opérationnel** : Tableau de bord, Planning, Gammes, Ordres de travail, Demandes, Relevés, Documents
   - **Référentiels** : Sites, Localisations, Équipements, Prestataires, Modèles
   - - entrée **Utilisateurs** (admin/manager) et `ModeToggle` + déconnexion dans le header.
3. **Nav selon rôle** : masquer les entrées non pertinentes (ex. demandeur → surtout Demandes).
   Lire le rôle via `current_role()` / contexte auth.
4. Les liens pointent vers des routes encore vides (placeholders) ; les écrans arrivent aux étapes suivantes.

## Critère de validation

- Connecté, on voit la coquille ; la nav reflète le rôle ; une URL inconnue affiche le 404.
- `npm run lint` + `npm run typecheck` passent.
