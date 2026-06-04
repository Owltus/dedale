# 0004 — Front métier livré (19 étapes)

- **Date** : 2026-06-04
- **Statut** : accepté

## Contexte

Exécution du plan `plan/front-metier/` : construction de tout le front métier de la GMAO sur la
nouvelle stack, en s'inspirant du périmètre de l'ancien projet. Réalisé étape par étape, avec
des agents en parallèle (≤ 4) pour les modules indépendants, et un contrôle centralisé
(build + `tsc -b` + ESLint strict + Prettier) après chaque étape.

## Décision / résultat

**19 modules livrés**, tous validés (build, types, lint au vert), feature-based (`src/features/<domaine>/`),
routes file-based sous le layout `_app`, scope multi-sites, gating de rôle calqué sur la RLS,
règle des 4 états, formulaires contrôlés + Zod, soft-delete, `.throwOnError()`, tokens sémantiques.

Fondations (1-3) ; Référentiels : Sites, Localisations, Équipements (+modèles), Prestataires & contrats ;
Maintenance : Gammes & opérations, Ordres de travail (snapshots + machine à états + `reouvrir_ot`),
Demandes d'intervention, Interventions de chantier ; Pilotage : Planning, Relevés, Tableau de bord,
Investissements (CapEx) ; Transverse : Documents (upload 3 étapes + `DocumentsTab` réutilisable),
Observations & registre ; Comptes : Edge Function `invite_user` + écran Utilisateurs.

Une revue de code multi-agents (3 relecteurs) a confirmé l'absence de bug bloquant ; corrigés :
fiche équipement re-dérivée après édition, gardes null sur la liste des gammes, dialogs de
résolution/clôture keyés.

## Suites connues (non bloquantes pour le front)

1. **Déployer l'Edge Function** : `supabase functions deploy invite_user` (login Supabase déjà fait).
   Tant qu'elle n'est pas déployée, l'invitation d'utilisateurs échoue côté UI.
2. **Brancher `DocumentsTab`** dans les onglets « Documents » des fiches (OT, gammes, équipements,
   chantiers, DI, prestataires, contrats, investissements) — aujourd'hui placeholders « À venir ».
3. **V2 / améliorations** : édition fine des `specifications` (JSONB) et des champs de modèles
   d'équipement ; lien observation→équipement à la création depuis un OT ; détection de changement
   de compteur (relevés) ; navigation temporelle des courbes ; visualisations riches du tableau de
   bord (sunburst/frise) ; alerte « OT réglementaires sans document ».
4. **Mineurs** : KPI du tableau de bord en UTC (léger décalage possible près de minuit) ;
   double fetch des mesures dans Relevés ; CORS `*` de l'Edge Function (durcissable) ;
   éventuel token `--success` pour un vert franc des badges de conformité.
