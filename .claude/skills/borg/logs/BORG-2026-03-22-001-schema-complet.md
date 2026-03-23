# BORG-2026-03-22-001 — schema.sql + fichiers racine

> Projet : GMAO hotel ERP (OKKO Nantes) / SQLite STRICT / Tauri (Rust)
> Drones deployes : Trois-de-Cinq, Sept-de-Neuf, Deux-de-Cinq, Quatre-de-Cinq, Six-de-Neuf
> Mode : DIAGNOSTIC

## Rapports des drones

### Drone 1 — Trois-de-Cinq (Cartographe)

**Inventaire factuel** :
- 42 tables (STRICT mode), 57 triggers, 76 index (dont 2 partiels)
- 13 colonnes snapshots dans ordres_travail
- 5 copies de logique contractuelle (SQLite pas de CREATE FUNCTION)
- 8 chaines de triggers critiques tracees

**Zones de complexite haute** :
1. `creation_ot_complet` (lignes 1550-1764) : 20+ sous-requetes, 3 etapes
2. `reinitialisation_resurrection` (lignes 2011-2177) : 5 etapes sequentielles
3. `gestion_statut_ot` (lignes 1790-1856) : 4 branches machine a etats
4. `protection_statut_annulee_manuel` (lignes 1155-1188) : 2 exceptions systeme
5. `a_propagation_gamme_vers_ot` (lignes 2303-2353) : 5 UPDATE croises
6. `validation_transitions_manuelles` (lignes 1038-1096) : 8 branches CASE

**Couplages forts** :
- creation_ot_complet ← reprogrammation_auto (hard coupling)
- gestion_statut_ot → nettoyage_dates_coherentes → reprogrammation_auto (cascade 3)
- Logique contractuelle dupliquee 5 fois
- Protection OT terminaux (BLACKLIST, 16 champs)
- Snapshots prestataire (id/nom, coherence critique)

**Chaine de triggers la plus longue** :
UPDATE ops → gestion_statut_ot → nettoyage_dates_coherentes → reprogrammation_auto → creation_ot_complet → 50+ statements SQL

---

### Drone 2 — Sept-de-Neuf (Conformite)

**Resultat global** : 195/198 regles CONFORMES (98.5%)

**Deviations** :
| # | Regle | Statut | Severite |
|---|-------|--------|----------|
| D-01 | Compteur triggers (55 vs 57) | □ DEVIATION | BASSE |
| D-02 | Compteur index (~90 vs 76) | □ DEVIATION | BASSE |
| AM-01 | Ordre AFTER triggers non documente | ◈ ANGLE MORT | MOYENNE |

**Points conformes notables** :
- 57/57 triggers nommes selon convention
- 3/3 paires INSERT+UPDATE completes
- 59 FK toutes indexees
- BLACKLIST protection_ot_terminaux documentee
- Methodologie RED→GREEN→REFACTOR respectee (AUDIT_TESTS.md)

---

### Drone 3 — Deux-de-Cinq (Resilience)

**Couverture** :
- 347/347 tests passants
- 57/57 triggers testes (100%)
- 42/42 tables testees (100%)
- 13/13 chaines de triggers en cascade testees (100%)

**Trous identifies** :
- B-05 : test suppression prestataire interne bloque — ABSENT (trivial, BASSE)
- Aucun trou CRITIQUE, HAUTE ou MOYENNE apres auto-steelman

**Qualite des tests** :
- Isolation : DB fraiche par test (:memory:)
- Factories : 20+ helpers (make_gamme, make_ot, etc.)
- Assertions : assert_blocked avec verification message
- Non-regression : chaque bug corrige a test + cas normal + cas limite

---

### Drone 4 — Quatre-de-Cinq (Failles)

**21 scans systematiques executes** :
1. Injection SQL via snapshots → PAS une faille (snapshots = affichage seulement)
2. NULL handling reprogrammation → PAS une faille (NOT NULL + COALESCE)
3. Race condition reprog/resurrection → PAS une faille (mono-writer SQLite)
4. Corruption snapshot technicien → PAS une faille (filtre statut 3/4)
5. Bascule prestataire non tracee → Documente (W-01 corrige)
6. Resurrection sans injection ops → PAS une faille (NOT EXISTS + DELETE orphelins)
7. Cycles localisations → PAS une faille (CTE recursive correcte)
8. contrats_gammes RESTRICT → Design choice documente (W-35)
9. Soft delete prestataires → PAS une faille (FK RESTRICT)
10. Dates invalides → Documente (W-13, validation applicative)
11. id_source sans FK → Documente (W-26, validation par triggers)
12. BLACKLIST oubli colonne → Fragile structurelle documentee
13. Tolerance reprogrammation → PAS une faille (ABS + julianday correct)
14. Annulation non tracee → Limitation design (pas d'audit trail)
15. NULL date_prevue → PAS une faille (NOT NULL constraint)
16. date invalide dans calcul → PAS une faille (STRICT mode)
17. Condition OT futur → PAS une faille (date() comparaison OK)
18. Race multi-op gestion_statut → PAS une faille (idempotent)
19. Loop controle validation_transitions → PAS une faille
20. Doublon INSERT archivage → PAS une faille (SELECT CASE bloque)
21. Protection desactivation gamme → PAS une faille (transactionnel)

**TOTAL** : 0 failles NOUVELLES confirmees

---

### Drone 5 — Six-de-Neuf (Contradicteur)

**Partie A — Contradiction des rapports** :
- Drone 1 (comptages) : VALIDE ✓
- Drone 2 (conformite) : VALIDE ✓, angle mort AM-01 confirme
- Drone 3 (resilience) : VALIDE ✓
- Drone 4 (0 failles) : VALIDE mais challenge avec 4 observations supplementaires

**Partie B — Trouvailles propres** :

| # | Observation | Severite | Verdict |
|---|-------------|----------|---------|
| C-01 | Duplication quintuple logique contrats (3 copies identiques dans creation_ot_complet) | MOYENNE | Risque maintenance documente, deja subi (W-01) |
| C-02 | Transition operation 4→5 non bloquee | BASSE | Cas impossible en contexte normal (OT terminal bloque) |
| C-03 | Race condition archivage contrat parent | BASSE | Non exploitable mono-utilisateur |
| C-04 | Chaine trigger cloture non documentee comme flux | BASSE | Documentation existante mais dispersee |

**Angles morts identifies** :
1. Tables structure operationnelle vides apres init (dependance setup client)
2. Asymetrie statut 5 (NA) en cascade documentee mais pas commentee dans le code

**Faux positifs elimines** : 0

---

## Verdict unifie

### Compteurs

| Metrique | Valeur |
|----------|--------|
| Deviations documentaires | 2 (BASSE) |
| Angles morts | 1 (MOYENNE) |
| Observations nouvelles | 4 (1 MOYENNE, 3 BASSES) |
| Failles CRITIQUES | 0 |
| Failles HAUTES | 0 |
| Tests manquants | 1 (trivial) |

### Actions requises

1. **Mettre a jour compteurs** SCHEMA_REFERENCE.md : 57 triggers, 76 index
2. **Ajouter test B-05** : suppression prestataire interne bloquee
3. **Enrichir commentaires** : renvois croises entre 5 copies logique contractuelle + flux cloture
4. **Optionnel** : test PRAGMA recursive_triggers = OFF

### Verdict global

**■ CONFORME avec reserves mineures.**
Schema robuste pour production mono-utilisateur. Aucune faille critique. Observations portent sur maintenabilite et documentation.

---

## Actions executees

Diagnostic uniquement.
