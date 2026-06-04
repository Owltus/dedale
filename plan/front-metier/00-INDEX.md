# Plan — Front métier Dédale (GMAO)

## Contexte

Reconstruire le **front métier** de Dédale en s'inspirant du périmètre fonctionnel de l'ancien
projet (documenté dans `doc-fonctionnelle/`), mais sur la nouvelle stack (Vite + React 19 +
TanStack + Tailwind 4 + shadcn/ui) et en consommant le backend Supabase **déjà déployé**.

Le socle technique est fait (auth, routing, design system, conventions). Il reste à construire
les écrans métier, du plus fondamental/réutilisable au plus spécifique.

**Point de cadrage majeur — adaptation, pas réplication.** L'ancien Dédale était **mono-utilisateur,
100 % local, sans rôles ni sites** (cf. `doc-fonctionnelle/README.md`). Le nouveau est
**multi-rôles (5) + multi-sites + RLS**. Conséquences structurantes :

- La **notion de Site** (au-dessus des bâtiments) est **nouvelle** et conditionne tout (scope RLS).
- Les **permissions par rôle** ne sont **pas documentées** dans l'ancien périmètre : à définir écran par écran.
- **Demandes d'intervention et ordres de travail sont découplés** côté backend (plus de conversion DI → OT).

## Décisions (tranchées)

Arbitrages pris pour avancer (best-practice + doctrine « simple et maîtrisé »). Révisables si besoin.

1. **Périmètre** : on déroule dans l'ordre. **MVP = Sprints A-B-C** (fondations + référentiels +
   maintenance) = GMAO utilisable ; puis pilotage/terrain (D) et comptes (E).
2. **Rôles par écran** : on **calque la RLS**. admin = tout ; manager = ses sites (supervise) ;
   technicien = métier sur ses sites ; lecteur = lecture ; demandeur = DI + lecture limitée.
   L'UI grise/masque les actions en cohérence ; la base reste l'autorité.
3. **Organisation des équipements** : la taxonomie Domaine/Famille passe par les **catégories**
   (`categorie_id`) du backend — **pas de table inventée**. L'équipement vit dans un local + une catégorie ;
   ses caractéristiques via `specifications` (JSONB) / `modeles_equipements`.
4. **Règle réglementaire OT** : la **base fait foi**. Le front guide (UX) et affiche proprement les
   erreurs ; il ne ré-implémente pas la règle. (Comportement backend exact vérifié en étape 9.)
5. **Planning & Relevés = dérivés** : calculés côté requêtes depuis `ordres_travail` /
   `operations_execution`. Si la charge devient trop lourde, on basculera l'agrégation en vue backend.
6. **Simplifications V1** (overkill repoussé en V2) : tableau de bord sobre (pas de sunburst/frise animés),
   pas d'archivage de champs de modèles, pas de détection auto de compteur, planning en vue unique (~12 sem.),
   avenants en simple historique.
7. **Création de comptes** : nécessite l'Edge Function `invite_user` (étape 16). En attendant, seul l'admin
   bootstrap existe — ne bloque pas les sprints A-D (mono-compte admin).

## Phases

| #   | Fichier                                                              | Phase                                   | Dépend de | Priorité | Effort | Livrable                                                             | Critique |
| --- | -------------------------------------------------------------------- | --------------------------------------- | --------- | -------- | ------ | -------------------------------------------------------------------- | -------- |
| 1   | [1-donnees-et-feature-pattern.md](./1-donnees-et-feature-pattern.md) | Types Supabase + couche d'accès         | —         | P0       | M      | Client typé + patron de feature réutilisable                         |          |
| 2   | [2-layout-et-navigation.md](./2-layout-et-navigation.md)             | Layout & navigation                     | 1         | P0       | M      | Coquille app (sidebar/header, route protégée, 404, nav selon rôle)   |          |
| 3   | [3-contexte-multi-sites.md](./3-contexte-multi-sites.md)             | Contexte multi-sites                    | 2         | P0       | S      | Sélecteur de site + `useSiteContext` (admin = tous)                  |          |
| 4   | [4-sites.md](./4-sites.md)                                           | Référentiel — Sites                     | 3         | P1       | S      | CRUD Sites (admin) — 1er CRUD canonique                              |          |
| 5   | [5-localisations.md](./5-localisations.md)                           | Référentiel — Localisations             | 4         | P1       | L      | Bâtiments → niveaux → locaux (galeries, cascade, fiche local)        |          |
| 6   | [6-equipements.md](./6-equipements.md)                               | Référentiel — Équipements               | 5         | P1       | L      | Équipements + modèles d'équipement (specifications, instancier)      |          |
| 7   | [7-prestataires-contrats.md](./7-prestataires-contrats.md)           | Référentiel — Prestataires & contrats   | 4         | P1       | L      | Prestataires, contrats (types/états), couverture gammes              |          |
| 8   | [8-gammes-operations.md](./8-gammes-operations.md)                   | Maintenance — Gammes                    | 6, 7      | P1       | L      | Gammes + opérations + modèles d'opérations + liaison équipements     |          |
| 9   | [9-ordres-de-travail.md](./9-ordres-de-travail.md)                   | Maintenance — Ordres de travail         | 8         | P1       | XL     | OT : liste, fiche, tableau d'exécution, machine à états, réouverture | ⚠        |
| 10  | [10-demandes-intervention.md](./10-demandes-intervention.md)         | Maintenance — Demandes d'intervention   | 6         | P1       | M      | DI + modèles DI, cycle Ouverte→Résolue↔Réouverte                     |          |
| 11  | [11-planning.md](./11-planning.md)                                   | Pilotage — Planning                     | 9         | P2       | L      | Grille famille × semaine dérivée des OT                              |          |
| 12  | [12-releves.md](./12-releves.md)                                     | Pilotage — Relevés                      | 9         | P2       | M      | Séries temporelles des mesures + courbes                             |          |
| 13  | [13-documents.md](./13-documents.md)                                 | Transverse — Documents                  | 5, 6      | P2       | L      | Bibliothèque + rattachements (upload 3 étapes)                       | ⚠        |
| 14  | [14-observations-registre.md](./14-observations-registre.md)         | Conformité — Observations               | 9         | P2       | M      | Observations + registre de sécurité (vues backend)                   |          |
| 15  | [15-tableau-de-bord.md](./15-tableau-de-bord.md)                     | Pilotage — Tableau de bord              | 9, 7, 10  | P2       | M      | Accueil synthétique (version sobre)                                  |          |
| 16  | [16-comptes-et-invite-user.md](./16-comptes-et-invite-user.md)       | Comptes — invite_user + gestion users   | 2         | P1       | L      | Edge Function `invite_user` + écrans d'invitation/rôles/sites        | ⚠        |
| 18  | [18-interventions-chantier.md](./18-interventions-chantier.md)       | Maintenance — Interventions de chantier | 6, 7      | P1       | M      | Chantiers (machine à états, compte-rendu, locaux/équipements)        |          |
| 19  | [19-investissements-capex.md](./19-investissements-capex.md)         | Pilotage — Investissements (CapEx)      | 4         | P2       | M      | Suivi budgétaire (montants, statut libre, documents)                 |          |
| 17  | [17-validation-globale.md](./17-validation-globale.md)               | Finalisation                            | toutes    | P2       | M      | Revue globale, cohérence, polish, déploiement                        | ⚠        |

## Ordre d'exécution (sprints)

- **Sprint A — Fondations applicatives** : étapes 1 → 2 → 3 (séquentiel, socle de tout le reste).
- **Sprint B — Référentiels** : étape 4, puis 5 et 7 (parallélisables), puis 6 (après 5).
- **Sprint C — Maintenance** : étape 8, puis 9 ; 10 et 18 (chantiers) parallélisables (dépendent de 6/7).
- **Sprint D — Pilotage & terrain** : 11, 12, 13, 14, 15, 19 (CapEx) — parallélisables une fois 9 fait.
- **Sprint E — Comptes & finalisation** : 16 (peut démarrer tôt, dépend de 2), 17 en dernier.

MVP recommandé = **Sprints A + B + C**. Le reste vient ensuite.

## Architecture cible

```
src/
  routes/
    __root.tsx
    login.tsx
    _app.tsx                  # layout protégé (sidebar + header) — étape 2
    _app/
      index.tsx               # tableau de bord — étape 15
      sites.tsx               # étape 4
      localisations/…         # étape 5
      equipements/…           # étape 6
      prestataires/…          # étape 7
      gammes/…                # étape 8
      ordres-travail/…        # étape 9
      demandes/…              # étape 10
      planning.tsx            # étape 11
      releves/…               # étape 12
      documents.tsx           # étape 13
      registre.tsx            # étape 14
      utilisateurs.tsx        # étape 16
  features/<domaine>/         # queries.ts, mutations.ts, schemas.ts, components/
  components/ui|common/       # design system (déjà là)
  lib/                        # supabase.ts, utils.ts, database.types.ts (étape 1)
```

## Fichiers impactés (résumé)

| Couche        | Fichiers modifiés       | Fichiers nouveaux                                                    |
| ------------- | ----------------------- | -------------------------------------------------------------------- |
| Données / lib | `src/lib/supabase.ts`   | `src/lib/database.types.ts`, helpers data                            |
| Routing       | `src/routes/__root.tsx` | `_app.tsx` + 1 route par module                                      |
| Features      | —                       | `src/features/<domaine>/*` (≈ 12 domaines)                           |
| Composants    | —                       | composants `common/` transverses (DataTable, Gallery, EntityDialog…) |
| Infra         | —                       | Edge Function `invite_user` (étape 16)                               |

Le **backend n'est pas modifié** : tout passe par l'API Supabase existante (tables, vues `v_*`, RPC).
