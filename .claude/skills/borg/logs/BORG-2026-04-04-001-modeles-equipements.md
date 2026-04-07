# BORG-2026-04-04-001 — Backend modeles d'equipement

> Projet : Mantis — Tauri v2 + Rust + SQLite
> Drones deployes : 5 (Cartographe, Conformite, Resilience, Failles, Contradicteur)
> Mode : EXECUTION

## Zone assimilee
- schema.sql : 3 tables (modeles_equipements, champs_modele, valeurs_equipements) + modification familles_equipements
- seed.sql : 3 modeles, 16 champs, 16 valeurs
- commands/modeles_equipements.rs : 12 commandes Tauri
- commands/equipements.rs : modifications CRUD familles (id_modele_equipement)
- models/modeles_equipements.rs + models/equipements.rs
- db.rs (SCHEMA_VERSION 10→11), lib.rs (12 commandes enregistrees)
- seed.py (version + verifications)

## Rapports des drones

### Trois-de-Cinq (Cartographe)
- 3 tables SQL, 6 structs Rust, 12 commandes Tauri
- Architecture propre : modeles → champs → valeurs (3 niveaux CASCADE)
- Requete complexe : get_valeurs_equipement (4 INNER JOINs + 1 LEFT JOIN)
- Couplage principal : familles_equipements.id_modele_equipement (FK SET NULL)
- FamilleEquipListItem enrichi avec LEFT JOIN nom_modele (11 sous-SELECT)

### Sept-de-Neuf (Conformite)
- 23 CONFORMES / 2 DEVIATIONS / 0 ANGLES MORTS
- D1 : save_valeurs_equipement + reorder_champs_modele sans transaction (MOYENNE)
- D2 : Trigger WHEN clause inconsistante avec les autres triggers (BASSE)

### Deux-de-Cinq (Resilience)
- Protections SQL solides (CHECK, UNIQUE, FK CASCADE)
- Pas de tests automatises (coherent avec le projet)
- Validation type/liste deleguee au frontend (acceptable pour app locale)

### Quatre-de-Cinq (Failles)
- F1 : save_valeurs_equipement accepte id_champ d'un autre modele (FK protege existence, pas appartenance)
- F2 : get_valeurs_equipement silent empty si modele NULL (INNER JOIN)
- F3 : reorder_champs_modele accepte listes partielles/invalides sans validation
- F4 : Changement modele famille laisse valeurs orphelines
- F5 : Trigger WHEN inconsistant
- F6 : SCHEMA_VERSION commentaires vs code (cosmétique)

## Contre-rapport (Six-de-Neuf)

| Accusation | Verdict | Severite finale |
|---|---|---|
| F1 Injection champs | CONFIRME mais app locale mono-utilisateur, frontend controle | MOYENNE |
| F2 Silent empty | CONFIRME — comportement attendu (pas de modele = pas de champs) | BASSE |
| F3 Reorder partiel | CONFIRME — pas de transaction ni validation | HAUTE |
| F4 Valeurs orphelines | CONFIRME — par design (documente dans PRD) | MOYENNE |
| F5 Trigger WHEN | VALIDE — fonctionne mais inconsistant | BASSE |
| F6 SCHEMA_VERSION | VALIDE — commentaires historiques, schema correct | BASSE |
| D1 Transactions | CONFIRME — viole sqlite.md | HAUTE |

Faux positifs elimines : 2 (F5 trigger logique valide, F6 cosmétique)

## Verdict unifie

FAILLES CONFIRMEES : 4 + 2 deviations
- CRITIQUES : 0
- HAUTES : 2 (reorder sans tx/validation, save_valeurs sans tx)
- MOYENNES : 2 (injection cross-model theorique, valeurs orphelines par design)
- BASSES : 2 (silent empty attendu, trigger inconsistant)

## Actions executees

### Fix 1 — reorder_champs_modele (HAUTE)
- Ajout validation completude (COUNT champs vs taille ids)
- Ajout transaction (unchecked_transaction + commit)
- Message d'erreur explicite en francais

### Fix 2 — save_valeurs_equipement (HAUTE)
- Ajout transaction (unchecked_transaction + commit)

### Fix 3 — Trigger date_modification (BASSE)
- Retrait clause WHEN OLD.date_modification = NEW.date_modification
- Aligne sur le pattern standard des 9 autres triggers

### Verification
- `cargo build` : 0 erreur
- `python seed.py` : 3 modeles, 16 champs, 16 valeurs OK
