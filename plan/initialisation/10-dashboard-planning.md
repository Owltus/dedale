# Phase 10 — Dashboard & Planning

## Objectif
Dashboard proactif (KPIs, alertes, onboarding) + vue calendrier/planning des OT.

## Dépend de
Phase 7 (OT) + Phase 8 (DI)

## Étapes

### 10.1 Backend — Commandes Dashboard

**Fichier** : `src-tauri/src/commands/dashboard.rs`

```
get_dashboard_data() → DashboardData

struct DashboardData {
    // KPIs
    nb_ot_en_retard: i64,
    nb_ot_cette_semaine: i64,
    nb_di_ouvertes: i64,
    nb_contrats_a_risque: i64,

    // Alertes proactives
    contrats_expirant_30j: Vec<ContratAlerte>,     // date_fin <= now+30j, actifs
    gammes_regl_sans_ot: Vec<GammeAlerte>,         // réglementaires actives sans OT planifié
    ot_stagnants: Vec<OtAlerte>,                   // En cours depuis > 30 jours

    // Tableaux
    prochains_ot: Vec<OtListItem>,                 // 10 prochains, statut NOT IN (3,4)
    dernieres_di: Vec<DiListItem>,                 // 10 dernières par date_creation DESC
    ot_en_retard: Vec<OtListItem>,                 // date_prevue < today, statut IN (1,2,5)

    // Onboarding
    has_etablissement: bool,
    has_localisations: bool,
    has_equipements: bool,
    has_prestataires: bool,
    has_contrats: bool,
    has_gammes: bool,
    has_ot: bool,
}
```

**Requêtes SQL clés** :

```sql
-- Contrats à risque (expirent dans 30 jours)
SELECT c.*, p.libelle as nom_prestataire
FROM contrats c
JOIN prestataires p ON c.id_prestataire = p.id_prestataire
WHERE c.est_archive = 0
  AND c.date_resiliation IS NULL
  AND c.date_fin IS NOT NULL
  AND c.date_fin <= date('now', '+30 days')
  AND c.date_fin >= date('now');

-- Gammes réglementaires sans OT planifié
SELECT g.*, fe.nom_famille, p.libelle as nom_prestataire
FROM gammes g
JOIN familles_equipements fe ON g.id_famille = fe.id_famille
JOIN prestataires p ON g.id_prestataire = p.id_prestataire
WHERE g.est_active = 1
  AND g.est_reglementaire = 1
  AND NOT EXISTS (
      SELECT 1 FROM ordres_travail ot
      WHERE ot.id_gamme = g.id_gamme AND ot.id_statut_ot IN (1, 2, 5)
  );

-- OT stagnants (En cours depuis > 30 jours)
SELECT * FROM ordres_travail
WHERE id_statut_ot = 2 AND date_debut < date('now', '-30 days');
```

### 10.2 Backend — Commandes Planning

**Fichier** : `src-tauri/src/commands/planning.rs`

```
get_planning_mois(annee: i32, mois: i32) → Vec<PlanningEvent>
get_planning_semaine(date_debut: String)  → Vec<PlanningEvent>

struct PlanningEvent {
    id_ordre_travail: i64,
    nom_gamme: String,
    date_prevue: String,
    id_statut_ot: i64,
    id_priorite: i64,
    est_reglementaire: bool,
    nom_prestataire: String,
}
```

### 10.3 Frontend — Dashboard

**Fichier** : `src/pages/dashboard/Dashboard.tsx`

Sections (dans l'ordre du PRD-FRONTEND) :
1. AlertBanner (contrats expirants, gammes sans OT, OT stagnants) — visible seulement si alertes
2. 4 StatCards KPI
3. Grid 2 colonnes : Prochains OT + Dernières DI
4. Tableau OT en retard
5. Stepper onboarding (si base vide)

### 10.4 Frontend — Planning

**Fichiers** :
```
src/pages/planning/
├── Planning.tsx            # Page avec toggle semaine/mois + navigation
├── CalendarGrid.tsx        # Vue mois (grille 7 colonnes × 5-6 lignes)
├── CalendarCell.tsx        # Cellule d'un jour (liste des OT)
├── CalendarEvent.tsx       # Badge OT dans une cellule
├── WeekGrid.tsx            # Vue semaine (7 colonnes)
└── WeekEvent.tsx           # Bloc OT dans une colonne
```

**Interactions** :
- Clic sur un événement → navigation vers `/ordres-travail/:id`
- Badge coloré par statut OT (même palette que les badges de la liste)
- Icône cadenas si `est_reglementaire = 1`
- Indicateur de priorité (bordure colorée)

## Critère de validation
- Dashboard affiche les 4 KPIs corrects
- Alertes proactives visibles quand les conditions sont remplies
- Stepper onboarding visible sur base vide, disparaît quand les étapes sont remplies
- Planning mois : OT positionnés au bon jour
- Planning semaine : navigation avant/arrière
- Clic sur un OT dans le planning navigue vers le détail
