# Étape 11 — Schema SQL : localisation héritée

## Objectif
Modifier la table `gammes` et les triggers pour que la localisation soit calculée automatiquement depuis les équipements liés.

## Fichier impacté
- `src-tauri/schema.sql`

## Travail à réaliser

### 1. Modifier table `gammes`

**Supprimer :**
- `id_local INTEGER` (colonne)
- `FOREIGN KEY (id_local) REFERENCES locaux(id_local) ON DELETE RESTRICT` (FK)

**Ajouter :**
```sql
id_batiment_calc       INTEGER,
id_niveau_calc         INTEGER,
id_local_calc          INTEGER,
nom_localisation_calc  TEXT,
FOREIGN KEY (id_batiment_calc) REFERENCES batiments(id_batiment) ON DELETE SET NULL,
FOREIGN KEY (id_niveau_calc)   REFERENCES niveaux(id_niveau)     ON DELETE SET NULL,
FOREIGN KEY (id_local_calc)    REFERENCES locaux(id_local)       ON DELETE SET NULL
```

### 2. Supprimer index obsolète
- `idx_gammes_local ON gammes(id_local, est_active)` → supprimer

### 3. Ajouter index
```sql
CREATE INDEX idx_gammes_batiment_calc ON gammes(id_batiment_calc);
CREATE INDEX idx_gammes_niveau_calc ON gammes(id_niveau_calc);
CREATE INDEX idx_gammes_local_calc ON gammes(id_local_calc);
```

### 4. Ajouter triggers de calcul LCA

**`calcul_localisation_gamme_after_link`** — AFTER INSERT ON gammes_equipements
**`calcul_localisation_gamme_after_unlink`** — AFTER DELETE ON gammes_equipements

Les deux exécutent la même logique de recalcul pour `NEW.id_gamme` / `OLD.id_gamme`.

**`calcul_localisation_gamme_equip_move`** — AFTER UPDATE OF id_local ON equipements
Recalcule toutes les gammes liées à cet équipement.

Logique LCA :
```sql
-- Compter les distincts
-- nb_bat = COUNT(DISTINCT id_batiment)
-- nb_niv = COUNT(DISTINCT id_niveau)
-- nb_loc = COUNT(DISTINCT id_local)

-- Résolution :
-- 0 équipements → tout NULL
-- nb_bat > 1 → tout NULL (multi-bâtiments, pas de LCA)
-- nb_bat = 1, nb_niv > 1 → id_batiment_calc seulement, label = "Bâtiment"
-- nb_niv = 1, nb_loc > 1 → id_batiment_calc + id_niveau_calc, label adaptatif
-- nb_loc = 1 → tout rempli, label adaptatif

-- Label mono-bâtiment : "Niveau - Local" ou "Niveau" ou "Bâtiment"
-- Label multi-bâtiments : "Bâtiment - Niveau - Local" ou "Bâtiment - Niveau" ou "Bâtiment"
```

### 5. Ajouter triggers propagation renommage → recalcul gammes

**`recalcul_localisation_gamme_rename_batiment`** — AFTER UPDATE OF nom ON batiments
Recalcule `nom_localisation_calc` de toutes les gammes avec `id_batiment_calc = NEW.id_batiment`.

**`recalcul_localisation_gamme_rename_niveau`** — AFTER UPDATE OF nom ON niveaux
Idem avec `id_niveau_calc = NEW.id_niveau`.

**`recalcul_localisation_gamme_rename_local`** — AFTER UPDATE OF nom ON locaux
Idem avec `id_local_calc = NEW.id_local`.

### 6. Simplifier triggers OT

**`creation_ot_complet`** — snapshot :
```sql
nom_localisation = (SELECT nom_localisation_calc FROM gammes WHERE id_gamme = NEW.id_gamme)
```
Plus besoin de JOIN locaux/niveaux/batiments.

**`reinitialisation_resurrection`** — idem.

**`a_propagation_gamme_vers_ot`** — bloc localisation :
```sql
UPDATE ordres_travail
SET nom_localisation = NEW.nom_localisation_calc
WHERE id_gamme = NEW.id_gamme
  AND id_statut_ot NOT IN (3, 4)
  AND (OLD.nom_localisation_calc IS NOT NEW.nom_localisation_calc);
```

### 7. Supprimer anciens triggers propagation renommage → OT
- `propagation_renommage_batiment` (renommage bat → OT direct)
- `propagation_renommage_niveau` (renommage niv → OT direct)
- `propagation_renommage_local` (renommage loc → OT direct)

Remplacés par : renommage → recalcul gamme → propagation gamme → OT (chaîne existante).

## Critère de validation
- SQL syntaxiquement valide
- Aucune référence à `gammes.id_local` (sauf commentaires)
- Les triggers de calcul LCA fonctionnent sur INSERT/DELETE gammes_equipements
