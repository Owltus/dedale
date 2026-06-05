# Étape 7 — Validation responsive globale

## Objectif

Vérifier l'ensemble de l'application aux trois tailles d'écran (mobile, tablette,
bureau), confirmer qu'aucune régression fonctionnelle n'a été introduite, et
auditer le diff complet. Dernière étape, garde-fou avant commit.

## Fichier(s) impacté(s)

- Aucun fichier de code en principe (étape de recette). Corrections ponctuelles
  si un écran révèle un défaut.

## Travail à réaliser

1. Lancer la chaîne complète : `npm run format`, `npx tsc -b`, `npx eslint .`,
   `npx vite build`. Tout doit être vert.

2. Revue manuelle aux breakpoints (`npm run dev`, redimensionnement ou
   devtools) :
   - Mobile (~375px) : sidebar en drawer via burger, pages en une colonne,
     planning scrollable, dialogs contenus, aucune barre horizontale parasite.
   - Tablette (~768px) : grilles à deux colonnes, drawer toujours actif sous
     `lg`.
   - Bureau (>=1024px) : sidebar fixe, grilles pleines, rendu identique à
     l'existant (pas de régression).

3. Vérifier les parcours sensibles : connexion, navigation entre sections,
   ouverture d'un détail, ouverture d'un dialog de formulaire, page « Mon
   profil », changement de site et de thème.

4. Audit du diff complet via le skill `/code-review` (en remplacement de `/borg`,
   non installé) : cibler les régressions de layout, les classes en dur, les
   éventuelles couleurs non sémantiques introduites.

## Critère de validation

- `npm run format`, `npx tsc -b`, `npx eslint .`, `npx vite build` verts.
- Les trois breakpoints sont validés visuellement sur un échantillon
  représentatif de pages (au moins : dashboard, une liste, un détail, planning,
  un dialog, profil, login).
- `/code-review` ne remonte aucune régression bloquante.
- Aucune modification de logique métier sur l'ensemble du chantier (diff limité
  au layout/responsive).
