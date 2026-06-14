# Étape 6 — Recette & validation globale

## Objectif

Valider le chantier bout-en-bout : parité fonctionnelle avec les modèles d'équipement,
intégrité SQL (triggers, RLS, copie), absence de régression sur les consommateurs existants
(gammes, import de modèles d'opération), et qualité (typecheck/lint/build).

## Contexte

- Toutes les migrations 014-017 sont appliquées en prod, `schema_complete.sql` synchronisé,
  types régénérés. Le front est réécrit.
- Consommateurs à NON-régresser : `features/gammes` (section « Modèles d'opération liés » d'une
  gamme via `gamme_modeles`, import via `poolImport`), suppression fine d'un modèle lié.

## Fichier(s) impacté(s)

- Aucun nouveau — vérification transverse.

## Travail à réaliser

### 1. Qualité

```bash
npm run typecheck
npm run lint
npm run build
```

### 2. Parcours fonctionnel (rôles & périmètres)

- **admin/manager** : créer catégorie `'operation'` (commun) → créer modèle dedans → éditer
  ses items → copier vers un site → vérifier la copie (catégorie de site, items présents).
- **technicien** (accès à un site) : voit le commun en lecture, crée/édite sur son site,
  options « Commun » gatées, copie commun → son site OK.
- **lecteur/demandeur** : onglet non accessible (rôles métier seulement).

### 3. Intégrité SQL (contrôles ciblés)

- Catégorie `'operation'` racine-only : sous-catégorie refusée.
- Modèle d'opération + catégorie de mauvais scope → refus.
- Cohérence site modèle ↔ catégorie → refus si incohérent.
- Soft-delete d'une catégorie d'opération non vide → refus ; suppression d'une catégorie
  référencée → refus FK.
- `copier_modele_operation` : droits, repli « Non classé (opérations) », copie des items,
  indépendance de la copie.

### 4. Non-régression

- Page Plan de maintenance (gammes) : import d'un modèle d'opération dans une gamme inchangé.
- Suppression fine d'un modèle d'opération lié à des gammes : message + RPC
  `detacher_et_supprimer_modele_operation` inchangés.
- Realtime entre fenêtres (catégories + modèles d'opération).

## Ordre d'exécution

1. Qualité (typecheck/lint/build).
2. Parcours fonctionnel par rôle.
3. Contrôles d'intégrité SQL.
4. Non-régression gammes/import/suppression.

## Critère de validation

- `npm run typecheck`, `npm run lint`, `npm run build` : tous verts.
- Le parcours « catégorie → modèle → items → copie vers un site » fonctionne pour
  admin/manager et technicien, avec les bons gating de périmètre.
- Aucun mur d'erreur SQL brut : toute transition interdite est catchée et affichée proprement.
- Aucune régression sur la page Plan de maintenance ni sur l'import de modèles d'opération.

## Contrôle (audit manuel — étape critique)

- Re-vérifier que la RLS reste l'arbitre réel (un INSERT/UPDATE hors scope renvoie 42501,
  catché → toast) — l'UI ne fait que présenter les droits.
- Confirmer qu'aucun DELETE direct d'un modèle d'opération n'a été réintroduit (toujours via la
  RPC atomique, sinon liaisons cross-site masquées → 23503).
- Vérifier que `schema_complete.sql` reflète EXACTEMENT l'état prod (enum, colonne, triggers,
  RPC) — source de vérité.
- Confirmer l'absence d'orphelins de catégorie « Non classé (opérations) » dupliqués par site
  (find-or-create idempotent).
