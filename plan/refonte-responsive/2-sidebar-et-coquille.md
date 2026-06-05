# Étape 2 — Sidebar + coquille responsive

## Objectif

Transformer la coquille `_app` et la sidebar pour qu'elles s'adaptent à l'écran :
sidebar fixe sur bureau (`lg+`), drawer escamotable (Sheet) sur mobile et tablette,
ouverte par un burger placé dans une barre supérieure mobile. C'est le coeur de la
refonte navigation.

## Contexte

Aujourd'hui `src/routes/_app.tsx` rend `<div className="flex h-screen"><AppSidebar />

<main ...><Outlet /></main></div>` et `AppSidebar` est un `<aside className="... w-60
shrink-0 ...">` toujours visible. Aucun état d'ouverture, aucun breakpoint. Le
composant `Sheet` n'existe pas encore ; `@radix-ui/react-dialog` (déjà installé)
sert de base.

## Fichier(s) impacté(s)

- `src/components/ui/sheet.tsx` (nouveau — wrapper Radix Dialog en panneau latéral)
- `src/components/common/mobile-header.tsx` (nouveau — barre supérieure mobile)
- `src/components/common/app-sidebar.tsx` (modifié — contenu extrait, réutilisable)
- `src/routes/_app.tsx` (modifié — layout adaptatif + état du drawer)

## Travail à réaliser

1. Créer `src/components/ui/sheet.tsx` : un panneau latéral basé sur
   `@radix-ui/react-dialog` (overlay + contenu qui glisse depuis la gauche), avec
   `SheetContent`, `SheetOverlay`, animation via `tw-animate-css`/data-state, et
   fermeture au clic sur l'overlay. Tokens sémantiques uniquement (`bg-card`,
   `border`). S'inspirer du `dialog.tsx` existant pour la structure et l'a11y.

2. Refactoriser `app-sidebar.tsx` : extraire le contenu interne (logo, titre,
   `SiteSwitcher`, groupes de navigation, `UserMenu`) dans un sous-composant
   réutilisable `SidebarContent`, pour pouvoir l'afficher soit dans l'`<aside>`
   fixe (bureau) soit dans le `SheetContent` (mobile) sans dupliquer la nav.

3. Adapter `_app.tsx` :
   - Ajouter un état d'ouverture du drawer (`useState(false)`), fermé par défaut.
   - Rendu :
     - `<aside className="hidden lg:flex ...">` : sidebar fixe visible seulement
       à partir de `lg`.
     - `<MobileHeader onMenu={...} />` : visible seulement sous `lg`
       (`lg:hidden`), porte le burger (ouvre le Sheet) + logo/titre compact.
     - `<Sheet open={...} onOpenChange={...}>` contenant `SidebarContent` pour
       mobile/tablette.
     - `<main className="min-w-0 flex-1 overflow-auto">` inchangé pour le contenu.
   - Fermer le drawer automatiquement au changement de route (s'abonner à la
     navigation TanStack Router, ou fermer dans le `onSelect` des liens de nav).

4. Créer `mobile-header.tsx` : barre `lg:hidden` collante en haut
   (`sticky top-0 z-30`), fond `bg-card border-b`, contenant un bouton burger
   (icône `Menu` de lucide, `aria-label`) et le logo + « Dédale ». Hauteur
   compacte (`h-14`).

5. Vérifier les interactions : le `UserMenu` (DropdownMenu Radix) et le
   `SiteSwitcher` doivent rester utilisables dans le drawer ; vérifier qu'il n'y a
   pas de conflit de `z-index` entre le Sheet (overlay) et les menus.

## Critère de validation

- `npx tsc -b`, `npx eslint .`, `npx vite build` passent.
- Sous `lg` : la sidebar fixe disparaît, une barre supérieure avec burger
  apparaît ; le burger ouvre un drawer latéral avec toute la navigation ; un clic
  sur un lien navigue ET ferme le drawer.
- À partir de `lg` : sidebar fixe visible en permanence, pas de barre supérieure,
  pas de burger.
- Le thème (clair/sombre/auto) et le changement de site fonctionnent dans les deux
  modes.
- Aucune régression de la garde d'authentification de `_app` (redirection
  `/login` si pas de session).
