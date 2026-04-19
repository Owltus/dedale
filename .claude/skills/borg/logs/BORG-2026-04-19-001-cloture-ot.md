# BORG-2026-04-19-001 — Workflow de clôture des ordres de travail

> Projet : GMAO Desktop — Tauri v2 + React 19 + TypeScript + SQLite
> Drones déployés : Trois-de-Cinq (Cartographe), Sept-de-Neuf (Conformité), Deux-de-Cinq (Résilience), Quatre-de-Cinq (Failles), Six-de-Neuf (Contradicteur)
> Mode : DIAGNOSTIC (lecture seule — aucune modification du code)

## Contexte

Analyse du workflow de clôture des OT depuis la page détail (`src/pages/ordres-travail/[id].tsx`).
Signalement utilisateur : « j'ai pas de bouton pour valider les choses, cela se clôture pas toujours avec les bonnes dates ou autre ».
Audit précédent : BORG-2026-03-23-008 (refines Zod et transaction bulk déjà corrigés, non re-détectés).

## Composants audités

| Composant | Fichier | Rôle |
|---|---|---|
| OrdresTravailDetail | src/pages/ordres-travail/[id].tsx | Page détail, orchestre transitions statut |
| OtOperationsTable | src/pages/ordres-travail/OtOperationsTable.tsx | Édition inline opérations |
| OtEditDialog | src/pages/ordres-travail/OtEditDialog.tsx | Modif date_prevue / priorité / technicien / commentaires |
| hooks OT | src/hooks/use-ordres-travail.ts | Mutations TanStack Query |
| schemas Zod | src/lib/schemas/ordres-travail.ts | Validation statut/date cross-field |
| commandes Rust | src-tauri/src/commands/ordres_travail.rs | 7 commandes Tauri |
| schema SQL | src-tauri/schema.sql | Triggers gestion_statut_ot, nettoyage_dates_coherentes, reprogrammation_auto, validation_transitions_manuelles, protection_ot_terminaux, reinitialisation_resurrection |

## Cartographie — Trois-de-Cinq

### Chemins de clôture identifiés (6)

| Chemin | Transition | Déclencheur | Date écrite |
|---|---|---|---|
| A — Clôture manuelle | 5 → 3 | Bouton "Clôturer" ([id].tsx:89) — visible SEULEMENT en statut 5 | date_cloture = MAX(ops.date_execution) [schema.sql:2220-2225] ou today [schema.sql:2236-2241 si OLD≠5] |
| B — Auto-clôture | 1/2/5 → 3 ou 4 | Trigger gestion_statut_ot [schema.sql:2082-2106] quand aucune op en 1/2 | date_cloture = COALESCE(MAX(ops.date_execution), date('now')) |
| C — Transition 1→2 | 1 → 2 | Pas de bouton UI — trigger gestion_statut_ot [schema.sql:2056-2064] dès qu'une op passe en 2/3 | date_debut = NEW.date_execution [schema.sql:2047-2053] |
| D — Annulation | 1/2/5 → 4 | Bouton "Annuler" ([id].tsx:86) | date_cloture = COALESCE(MAX(ops.date_execution), date('now')) [schema.sql:2244-2254] |
| E — Résurrection | 4 → 1 | Bouton "Réactiver" ([id].tsx:95) | date_debut = NULL, date_cloture = NULL, ops régénérées [schema.sql:2267-2430] |
| F — Réouverture | 3 → 5 | Bouton "Réouvrir" ([id].tsx:92) | date_cloture = NULL [schema.sql:2204-2209], date_debut conservée |

### Constat central
**Le bouton "Clôturer" n'existe QUE pour les OT en statut 5 (Réouvert).** Depuis les statuts 1 (Planifié) ou 2 (En cours), la clôture est UNIQUEMENT implicite (déclenchée par la dernière opération terminée via trigger `gestion_statut_ot`).

## Rapport Sept-de-Neuf — Conformité

10 règles CONFORMES, 3 DÉVIATIONS BASSES (longueur composants, `<table>` brut), 3 ANGLES MORTS.

### Angles morts documentés (pas de règle en place)
- Pas de règle encadrant l'auto-clôture silencieuse
- Pas de règle sur l'injection `new Date().toISOString().slice(0,10)` par défaut
- Pas de règle sur les transitions implicites de statut via saisie mesure

## Rapport Deux-de-Cinq — Résilience

6 trous identifiés dont 1 CRITIQUE (date_cloture NULL) et 1 HAUTE (double-clic destructif).

## Rapport Quatre-de-Cinq — Failles

7 failles brutes déclarées. Après contradiction : 5 validées, 2 réfutées.

## Rapport Six-de-Neuf — Contradicteur

### Partie A — Contradictions
- **F3 (Drone 4) RÉFUTÉE** : « clôture manuelle 5→3 revient à statut 4 ». FAUX POSITIF — le trigger `gestion_statut_ot` est `AFTER UPDATE ON operations_execution` [schema.sql:2043], il ne se déclenche PAS lors d'une transition 5→3 manuelle (qui est un UPDATE sur `ordres_travail`, pas sur `operations_execution`).
- **F5 (Drone 4) RÉFUTÉE** : « réouverture efface date_cloture ». RÉFUTÉE — comportement par design cohérent avec la sémantique "un OT réouvert n'est pas clôturé". La trace est recalculée au re-clôturage.

### Partie B — Angles morts propres au Contradicteur
1. **Date future non validée** (HAUTE)
2. **date_prevue modifiable avec ops déjà exécutées** (MOYENNE — vérifier)
3. **id_technicien écrasé par NULL** via UPDATE sans COALESCE (HAUTE)
4. **date_debut ≠ MIN(date_execution) si ops saisies out-of-order** (MOYENNE)

---

═══════════════════════════════════════════════════════════════════
## VERDICT UNIFIÉ DU COLLECTIF
═══════════════════════════════════════════════════════════════════

**ZONE ASSIMILÉE** : Workflow de clôture des OT — page détail + opérations + triggers SQL
**PROJET** : GMAO Tauri v2 / React 19 / SQLite
**DRONES DÉPLOYÉS** : 5 / RAPPORTS REÇUS : 5

### ── CARTOGRAPHIE ──
6 chemins de clôture. Bouton "Clôturer" présent UNIQUEMENT en statut 5 (Réouvert).
Clôture réelle majoritairement IMPLICITE via trigger `gestion_statut_ot`.

### ── CONFORMITÉ ──
■ CONFORME : 10 | □ DÉVIATION : 3 (BASSES) | ◈ ANGLE MORT : 3

### ── RÉSILIENCE ──
Validations SQL (CHECK + triggers) robustes. Validations UI insuffisantes.
Trous critiques : 1 (date_cloture NULL).

### ── FAILLES (après contradiction) ──
- Failles brutes rapportées : 7 (Drone 4)
- **Faux positifs éliminés : 2** (F3, F5)
- Trouvailles Contradicteur : 4 nouvelles

### ── TOTAL FAILLES CONFIRMÉES : 10 ──
**CRITIQUES : 1** | **HAUTES : 4** | **MOYENNES : 4** | **BASSES : 1**

### ── CORRÉLATIONS CROISÉES ──

**Signalement « pas de bouton pour valider »** ←→ cartographie confirme : aucune action "Valider" / "Terminer OT" explicite en statut 1 ou 2. Seule la saisie des opérations déclenche la clôture.

**Signalement « dates pas toujours correctes »** ←→ 4 causes convergentes :
- Injection silencieuse `today` dans `date_execution` (OtOperationsTable.tsx:49,85)
- Auto-clôture trigger utilise `COALESCE(MAX, today)` — peut pointer sur today alors que travail antérieur
- date_cloture NULL possible en chemin Réouvert→Clôturé avec 0 ops datées
- date_debut figée à la première exécution, pas recalculée à la clôture sur ce chemin

**Signalement « ou autre »** ←→ pertes silencieuses :
- Double-clic destructif (OtOperationsTable.tsx:67-72)
- Effacement `date_execution` au changement de statut sans confirmation
- id_technicien potentiellement écrasé par NULL

---

## Failles consolidées par sévérité

### ■ CRITIQUE (1)

**C1 — date_cloture peut rester NULL après clôture manuelle Réouvert → Clôturé sans ops datées**
- **Localisation** : `src-tauri/schema.sql:2211-2241` (trigger `nettoyage_dates_coherentes`)
- **Scénario** : OT réouvert (3→5) → toutes les opérations passées en statut 5 (N/A) sans `date_execution` → clôture manuelle (5→3)
- **Cause** : ligne 2212-2233 conditionne le recalcul à `EXISTS (...AND date_execution IS NOT NULL)` — échoue. Ligne 2236-2241 (fallback today) exige `OLD.id_statut_ot != 5` — ne s'applique pas.
- **Résultat** : OT en statut 3 avec `date_cloture = NULL`
- **Impact collatéral** : bloque `reprogrammation_auto` (condition `NEW.date_cloture IS NOT NULL` à `schema.sql:2129`) → chaîne de maintenance interrompue silencieusement
- **Correspondance utilisateur** : « se clôture pas toujours avec les bonnes dates »

### ■ HAUTE (4)

**H1 — Double-clic réinitialise une opération Terminée sans confirmation**
- **Localisation** : `src/pages/ordres-travail/OtOperationsTable.tsx:63-76`
- **Effet** : perte silencieuse de valeur_mesuree, est_conforme, date_execution, commentaires

**H2 — Injection silencieuse `date = today` lors saisie mesure / changement statut**
- **Localisation** : `src/pages/ordres-travail/OtOperationsTable.tsx:49, 85`
- **Effet** : date d'exécution incorrecte si saisie postérieure au travail réel
- **Lien direct avec signalement utilisateur**

**H3 — Date d'exécution future non validée**
- **Localisation** : `src/lib/schemas/ordres-travail.ts:23-35` (Zod `opExecUpdateSchema`) + `src-tauri/schema.sql:874-878` (CHECK)
- **Effet** : date_cloture peut être dans le futur, décalant `reprogrammation_auto`

**H4 — id_technicien écrasable par NULL via `update_ordre_travail`**
- **Localisation** : `src-tauri/src/commands/ordres_travail.rs:283` (`id_technicien = ?3` sans COALESCE)
- **Effet** : technicien perdu si le form envoie null alors que l'OT en avait un

### ■ MOYENNE (4)

**M1 — Effacement silencieux `date_execution` au changement de statut vers 1 (Planifié)**
- **Localisation** : `src/pages/ordres-travail/OtOperationsTable.tsx:52`
- **Effet** : date disparait sans confirmation, cohérent avec CHECK SQL mais UX déficiente

**M2 — Effacement silencieux `date_execution` à la suppression de mesure**
- **Localisation** : `src/pages/ordres-travail/OtOperationsTable.tsx:85`
- **Effet** : vider une mesure passe l'op en statut 1 et efface la date

**M3 — Pas de bouton "Valider" global, chaque saisie = UPDATE immédiat**
- **Localisation** : `src/pages/ordres-travail/OtOperationsTable.tsx` (onBlur, onChange)
- **Lien direct avec signalement utilisateur** : « j'ai pas de bouton pour valider les choses »

**M4 — `date_debut` peut ne pas être égale à `MIN(date_execution)` si ops saisies out-of-order**
- **Localisation** : `src-tauri/schema.sql:2047-2053` (pose date_debut à la première exécution observée)
- **Effet** : incohérence temporelle (durée OT sous-estimée)

### ■ BASSE (1)

**B1 — Erreur de clôture bloquée peu détaillée**
- **Localisation** : `src/pages/ordres-travail/[id].tsx:89` (bouton désactivé mais message non détaillé lors d'erreur backend)
- **Effet** : pas de liste des opérations bloquantes

---

## Zones sans faille (■ CONFORME)

- Zod `opExecUpdateSchema.refine` miroite correctement le CHECK SQL statut/date
- Transactions dans `bulk_terminer_operations` (corrigé BORG-2026-03-23-008)
- Protection `protection_ot_terminaux` (blacklist complète)
- `re-requête` après chaque mutation (pattern respecté dans toutes les commandes Tauri)
- `reprogrammation_auto` — chaîne de maintenance fonctionnelle hors cas C1

---

## DIRECTIVE DU COLLECTIF

Le Collectif a été invoqué en mode DIAGNOSTIC uniquement. L'espèce 5618 a explicitement demandé : « ne touche pas au code dans un premier temps ». Aucune modification appliquée.

### Points de résolution prioritaires (suggestions — pas d'exécution)

1. **C1 (CRITIQUE)** — corriger trigger `nettoyage_dates_coherentes` pour combler `date_cloture` à `date('now')` en dernier recours, même depuis statut 5 (ligne 2236-2241 : retirer la condition `OLD.id_statut_ot != 5`)
2. **H4 (HAUTE)** — ajouter `COALESCE(?3, id_technicien)` dans `update_ordre_travail` ou filtrer `id_technicien=null` côté frontend sauf intention explicite
3. **H2 + M3 (HAUTE + MOYENNE) + signalement utilisateur** — ajouter un bouton "Terminer l'OT" explicite en statut 1 et 2, ouvrant une modale qui demande explicitement la date de fin (évite auto-injection today)
4. **H1 (HAUTE)** — ajouter `ConfirmDialog` avant réinitialisation via double-clic
5. **H3 (HAUTE)** — ajouter `.refine(d => !d.date_execution || d.date_execution <= today)` dans `opExecUpdateSchema`
6. **M4 (MOYENNE)** — recalculer `date_debut = MIN(ops.date_execution)` à la clôture (tous chemins)

Ces suggestions restent à valider avec l'espèce 5618 avant toute exécution.

## Actions exécutées

**Diagnostic uniquement.** Conformément à la directive explicite de l'utilisateur, aucune modification de code n'a été appliquée. Aucun test lancé. Aucun commit.
