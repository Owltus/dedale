/**
 * Classes de layout de la zone Synthèse du tableau de bord — regroupées ICI pour ne
 * pas dupliquer (le donut et le sunburst partagent EXACTEMENT la même classe).
 *
 * Les « curseurs » de réagencement responsive sont définis UNE SEULE FOIS dans le thème
 * (`src/index.css`, bloc `@theme`) et référencés ici par leur nom sémantique :
 *   - `@cadrans-trio:` → seuil `--container-cadrans-trio` (1060px) : donut | barres |
 *     sunburst tiennent sur une ligne (barres au milieu) ; EN DESSOUS (mobile inclus),
 *     donut + sunburst restent côte à côte (chacun sa moitié) et les barres passent
 *     pleine largeur en dessous ;
 *   - `h-cadran` / `min-w-cadran` → taille de référence `--spacing-cadran` (340px).
 * Restent en littéral (spécifiques aux carrés) : le plafond de demi-largeur `max-w-[400px]`
 * et la largeur préférée `basis-[45%]`.
 *
 * Ces variants exigent un ancêtre `@container` (posé sur le wrapper de la zone 1 dans
 * `dashboard.tsx`).
 */

/**
 * Cadran CARRÉ (donut, sunburst). Côte à côte À TOUTES LES TAILLES sous `@cadrans-trio`
 * (chacun ~la moitié via `grow` + `basis-[45%]`, plafonné à `max-w-[400px]`) — y compris
 * en mobile ; 340×340 fixe (hauteur `h-cadran` + `aspect-square` de la carte) dès
 * `@cadrans-trio`.
 */
export const CLASSE_CARRE_CADRAN =
  'min-w-0 overflow-hidden grow basis-[45%] max-w-[400px] @cadrans-trio:h-cadran @cadrans-trio:max-w-none @cadrans-trio:grow-0 @cadrans-trio:shrink-0 @cadrans-trio:basis-auto'

/**
 * Barres « Charge par semaine ». Pleine largeur et EN DESSOUS par défaut (`order-last`) ;
 * au MILIEU sur une ligne dès `@cadrans-trio`, remplissant l'espace restant (largeur
 * minimum = un cadran, hauteur = un cadran).
 */
export const CLASSE_BARRES_SYNTHESE =
  'order-last w-full @cadrans-trio:order-none @cadrans-trio:h-cadran @cadrans-trio:w-auto @cadrans-trio:min-w-cadran @cadrans-trio:flex-1'
