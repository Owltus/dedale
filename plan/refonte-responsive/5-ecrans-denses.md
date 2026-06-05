# Étape 5 — Écrans denses & composants spécifiques

## Objectif

Traiter les écrans et composants qui ne se règlent pas avec le simple conteneur :
le planning (grille 12 semaines), l'onglet documents (boutons d'action en ligne),
les dialogs/formulaires, et les graphiques de relevés. Ce sont les cas à plus fort
risque de débordement sur mobile.

## Fichier(s) impacté(s)

- `src/features/planning/components/planning-grille.tsx` (modifié)
- `src/components/common/documents-tab.tsx` (modifié)
- `src/features/releves/components/mesure-chart.tsx` (vérifié/ajusté)
- `src/components/ui/dialog.tsx` et dialogs de formulaire (vérifiés)

## Travail à réaliser

1. Planning : conserver le `overflow-x-auto` existant, mais réduire la colonne
   « Gamme » sticky sur mobile (`min-w-32 sm:min-w-48` au lieu de `min-w-48`
   figé) et ajouter un repère visuel de défilement horizontal (ombre/gradient sur
   le bord, ou texte d'aide « défiler »). La grille reste un tableau scrollable,
   pas de refonte en accordéon.

2. `documents-tab.tsx` : empiler les actions sur mobile. Le bloc des boutons
   (`Télécharger`, `Détacher`) passe en `flex-col` sur mobile, `sm:flex-row` ;
   garder l'icône + nom tronqué (`min-w-0 flex-1`) lisibles ; éventuellement
   masquer le badge MIME sous `sm` (`hidden sm:inline-flex`).

3. Dialogs : `DialogContent` shadcn est déjà mobile-first
   (`max-w-[calc(100%-2rem)] sm:max-w-lg`). Vérifier les formulaires longs
   (gammes, OT, équipement…) : ajouter `max-h-[85vh] overflow-y-auto` au contenu
   si un formulaire dépasse la hauteur d'un petit écran. Ne pas régresser le
   rendu bureau.

4. Graphiques de relevés (`mesure-chart.tsx`) : confirmer que le conteneur du
   chart est fluide (largeur 100 %, hauteur fixe raisonnable) et lisible sur
   mobile ; ajuster la hauteur/police si nécessaire.

## Critère de validation

- `npx tsc -b`, `npx eslint .`, `npx vite build` passent.
- Sur mobile : le planning défile horizontalement sans casser la mise en page, la
  colonne gamme reste visible (sticky) et plus étroite ; les actions documents
  sont empilées et cliquables ; aucun formulaire en dialog ne dépasse l'écran sans
  scroll interne.
- Aucune régression du rendu bureau de ces écrans.
