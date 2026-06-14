# Étape 6 — Recette & validation globale

## Objectif

Valider l'ensemble de la section « Bibliothèque » de bout en bout : cohérence du code (typecheck/lint/format), parcours fonctionnel des 4 écrans, contrôle des rôles et du responsive, et vérification de non-régression sur les écrans existants impactés.

## Contexte

Dernière étape du plan : elle ne crée pas de nouvelle fonctionnalité mais consolide le chantier. Elle est marquée critique pour servir de point de contrôle final avant clôture.

## Fichier(s) impacté(s)

- Aucun nouveau fichier (corrections ponctuelles éventuelles sur les fichiers des étapes 1 à 5).

## Travail à réaliser

### 1. Qualité de code

```bash
npm run typecheck
npm run lint
npm run format
npm run build
```

Corriger toute erreur résiduelle. Aucun `any`, erreurs Supabase toutes gérées (`.throwOnError()` + UI), classes Tailwind non triées à la main.

### 2. Parcours fonctionnel (en `admin` puis `manager`)

- Sidebar : groupe « Bibliothèque » présent, 4 entrées, navigation OK, accueil à cartes.
- Domaines & familles : créer domaine + famille, éditer, supprimer ; arbre correct.
- Modèles d'équipements : créer avec catégorie + specifications, éditer, supprimer ; `InstancierDialog` toujours fonctionnel dans `/equipements`.
- Gammes-types : créer modèle + items, réordonner, supprimer.
- Modèles de DI : créer (scope site), éditer, supprimer ; `NoSiteSelected` sans site.

### 3. Contrôle des rôles

- `technicien`, `lecteur`, `demandeur` : groupe « Bibliothèque » masqué ; accès direct à une URL `/bibliotheque/*` → redirection `landingFor(role)`.
- Vérifier qu'aucune écriture n'est offerte à un rôle non autorisé (et que la RLS renvoie bien une erreur catchée si forcée).

### 4. Responsive

- Mobile (< 640px), tablette (rail iconOnly + tooltips), bureau : chaque écran s'ouvre sur `<PageContainer>`, grilles via `cardGrid`, pas de scroll horizontal. Arbre des catégories et drill-down gammes-types lisibles sur mobile.

### 5. Non-régression

- Groupes « Opérationnel » et « Référentiels » inchangés.
- `routeTree.gen.ts` régénéré proprement, jamais édité à la main.

## Critère de validation

- `npm run typecheck`, `npm run lint`, `npm run build` passent sans erreur.
- Les 4 écrans sont pleinement fonctionnels (CRUD) en admin et manager.
- La visibilité et les gardes par rôle sont conformes (admin/manager seulement).
- Aucune régression sur `/equipements` (instanciation) ni sur la navigation existante.
- Affichage correct sur mobile / tablette / bureau.

## Contrôle (audit manuel — étape critique)

- Cohérence `nav.ts` ↔ routes ↔ sidebar : chaque NavKey a sa route, sa règle `NAV_ROLES` et son item (ou est l'accueil), aucun orphelin.
- Toutes les mutations gèrent l'erreur RLS `42501` avec un toast lisible (pas de crash, pas d'état incohérent).
- Toutes les listes filtrent le soft-delete (`deleted_at`) là où la colonne existe ; les tables sans `deleted_at` (modeles_operations) ne filtrent pas une colonne absente.
- Le scope entreprise/site est respecté : catégories et modèles d'équipements/opérations gèrent `site_id NULL` (entreprise) + site ; modèles de DI sont scope site strict.
- Aucun secret ni `.env.local` touché ; aucun appel direct à `auth.xxx()` hors `auth.uid()`.
