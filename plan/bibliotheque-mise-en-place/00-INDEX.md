# Plan — Bibliothèque (section catalogue admin/manager)

## Contexte

L'application ne dispose d'aucun écran pour gérer les **modèles / référentiels de catalogue** : catégories (domaines & familles), modèles d'équipements, gammes-types, modèles de demandes d'intervention. Ces données existent côté backend Supabase (déjà déployé) mais ne sont que partiellement consommées (les modèles d'équipements le sont uniquement via le bouton « instancier » dans `/equipements`).

L'objectif est d'introduire une **section « Bibliothèque »** dans la navigation, réservée aux rôles `admin` et `manager`, regroupant ces écrans de préparation. C'est la couche « catalogue niveau entreprise » d'où l'on instancie ensuite des données réelles sur les sites — distincte du groupe « Référentiels » (les instances réelles).

Contrainte forte : **chantier front pur, zéro SQL**. Le backend porte toute la logique et la sécurité (RLS). Le front présente et consomme. Les colonnes nécessaires (`categorie_id`, `specifications`, `parent_id`, etc.) existent déjà ; aucune migration n'est requise pour la v1.

---

## Décisions (tranchées)

Arbitrages pris pour avancer (modifiables au point de validation) :

1. **Front pur, zéro SQL.** Aucune modification du schéma Supabase. `npm run gen:types` n'est pas relancé (le contrat de types est inchangé).
2. **Routes imbriquées avec layout parent.** `bibliotheque.tsx` = layout pur (`requireNav('/bibliotheque')` + `<Outlet/>`), `bibliotheque/index.tsx` = accueil (cartes), puis 4 enfants. Chaque enfant porte **aussi** sa garde `requireNav` (le masquage sidebar n'est pas une sécurité).
3. **Visibilité = `ROLES_ADMINISTRATIF`** (admin/manager). Source unique : `src/lib/nav.ts` (NavKey + NAV_ROLES), partagée par la sidebar et les gardes.
4. **Une feature par entité** sous `src/features/` (`categories`, `modeles-equipements`, `modeles-operations`, `modeles-di`) pour coller au pattern existant (prestataires, gammes). La couche route `/bibliotheque/*` ne fait que les regrouper visuellement.
5. **Modèles d'équipements** : on crée `features/modeles-equipements/` et on y étend les `modelesEquipementsQueries` aujourd'hui logées dans `features/equipements/queries.ts`, en gardant un ré-export pour ne pas casser `InstancierDialog`.
6. **Catégories en arbre maison** : composant récursif `category-tree` (expand/collapse via `useState`, `ChevronRight`/`ChevronDown`), sans lib externe.
7. **Éditeur de `specifications`** : éditeur clé/valeur simple (lignes ajoutables/supprimables), validé Zod — pas de textarea JSON brut.
8. **Permissions d'écriture** alignées sur la visibilité (admin/manager). La RLS reste l'autorité réelle ; un INSERT/UPDATE hors scope renvoie `42501` à catcher et afficher proprement.

---

## Angles à clarifier

Divergences entre agents et découvertes à acter avant ou pendant l'exécution :

- **A1 — Accueil de section.** Layout parent pur + `index.tsx` (retenu) vs `bibliotheque.tsx` qui serait directement l'accueil. Décision retenue : layout parent + index.
- **A2 — Granularité des features.** Features par entité (retenu) vs feature unique `features/bibliotheque/`.
- **A3 — Asymétrie `modeles_di`.** `site_id` et `created_by` sont **NOT NULL** : les modèles de DI sont **scope site uniquement** (pas de niveau entreprise). L'écran exige un site actif (`NoSiteSelected`) et ne propose pas la dualité entreprise/site des trois autres écrans. À acter.
- **A4 — Nature du JSON `specifications`.** Clés libres (hypothèse retenue) ou schéma fixe par catégorie ? Conditionne l'éditeur.
- **A5 — Périmètre image/vignettes.** L'écran « Vignettes » (pool `miniatures`) et l'upload d'images sont **hors v1**. Les 4 écrans n'imposent aucune image (`image_path`/`miniature_id` facultatifs).
- **A6 — Déplacement de `modelesEquipementsQueries`.** Le sortir de `features/equipements/` touche `InstancierDialog` (risque mineur) vs le réutiliser en place.

---

## Phases

| #   | Fichier                                                    | Phase                            | Dépend de  | Priorité | Effort | Livrable                                                                        | Critique |
| --- | ---------------------------------------------------------- | -------------------------------- | ---------- | -------- | ------ | ------------------------------------------------------------------------------- | -------- |
| 1   | [1-fondations-navigation.md](./1-fondations-navigation.md) | Fondations nav & routing         | —          | P0       | M      | Groupe sidebar « Bibliothèque », layout parent, accueil à cartes, 4 routes stub | ⚠        |
| 2   | [2-domaines-et-familles.md](./2-domaines-et-familles.md)   | Catégories (domaines & familles) | 1          | P0       | L      | Feature `categories` + écran arbre + CRUD                                       |          |
| 3   | [3-modeles-equipements.md](./3-modeles-equipements.md)     | Modèles d'équipements            | 2          | P1       | L      | Feature `modeles-equipements` + CRUD + éditeur specifications                   |          |
| 4   | [4-gammes-types.md](./4-gammes-types.md)                   | Gammes-types                     | 1          | P1       | L      | Feature `modeles-operations` + CRUD modèle + items                              |          |
| 5   | [5-modeles-di.md](./5-modeles-di.md)                       | Modèles de DI                    | 1          | P2       | M      | Feature `modeles-di` + CRUD (scope site)                                        |          |
| 6   | [6-validation-globale.md](./6-validation-globale.md)       | Recette & validation             | 2, 3, 4, 5 | P0       | S      | Parcours complet, typecheck, lint, contrôle rôles/responsive                    | ⚠        |

---

## Ordre d'exécution (sprints)

- **Sprint A — Fondations** : étape 1 (débloque tout le reste).
- **Sprint B — Base** : étape 2 (les modèles d'équipements en dépendent via `categorie_id`).
- **Sprint C — Écrans (parallélisables)** : étapes 3, 4, 5. L'étape 3 dépend de 2 ; les étapes 4 et 5 ne dépendent que de 1 et peuvent démarrer dès la fin du Sprint A.
- **Sprint D — Recette** : étape 6.

En exécution séquentielle du skill : 1 → 2 → 3 → 4 → 5 → 6.

---

## Architecture cible

```
src/
  routes/_app/
    bibliotheque.tsx                  (layout : requireNav('/bibliotheque') + <Outlet/>)
    bibliotheque/
      index.tsx                       (/bibliotheque — accueil, cartes de navigation)
      categories.tsx                  (/bibliotheque/categories)
      modeles-equipements.tsx         (/bibliotheque/modeles-equipements)
      gammes-types.tsx                (/bibliotheque/gammes-types)
      modeles-di.tsx                  (/bibliotheque/modeles-di)
  features/
    categories/          queries.ts · mutations.ts · schemas.ts · components/{category-tree, category-form-dialog}
    modeles-equipements/ queries.ts · mutations.ts · schemas.ts · components/{modele-equipement-form-dialog, specifications-editor}
    modeles-operations/  queries.ts · mutations.ts · schemas.ts · components/{gamme-type-form-dialog, operation-items-editor}
    modeles-di/          queries.ts · mutations.ts · schemas.ts · components/{modele-di-form-dialog}
  lib/nav.ts                          (+ NavKeys /bibliotheque*, + NAV_ROLES → ROLES_ADMINISTRATIF)
  components/common/app-sidebar.tsx   (+ groupe BIBLIOTHEQUE + NavGroup)
```

---

## Fichiers impactés (résumé)

| Couche                         | Fichiers modifiés                                         | Fichiers nouveaux                                                                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routing                        | —                                                         | `src/routes/_app/bibliotheque.tsx`, `bibliotheque/index.tsx`, `bibliotheque/categories.tsx`, `bibliotheque/modeles-equipements.tsx`, `bibliotheque/gammes-types.tsx`, `bibliotheque/modeles-di.tsx` |
| Navigation                     | `src/lib/nav.ts`, `src/components/common/app-sidebar.tsx` | —                                                                                                                                                                                                   |
| Features — categories          | —                                                         | `src/features/categories/{queries,mutations,schemas}.ts`, `components/{category-tree,category-form-dialog}.tsx`                                                                                     |
| Features — modeles-equipements | `src/features/equipements/queries.ts` (ré-export)         | `src/features/modeles-equipements/{queries,mutations,schemas}.ts`, `components/{modele-equipement-form-dialog,specifications-editor}.tsx`                                                           |
| Features — modeles-operations  | —                                                         | `src/features/modeles-operations/{queries,mutations,schemas}.ts`, `components/{gamme-type-form-dialog,operation-items-editor}.tsx`                                                                  |
| Features — modeles-di          | —                                                         | `src/features/modeles-di/{queries,mutations,schemas}.ts`, `components/{modele-di-form-dialog}.tsx`                                                                                                  |
| **Total**                      | **3 modifiés**                                            | **~22 nouveaux**                                                                                                                                                                                    |
