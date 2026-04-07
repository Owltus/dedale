# Localisation héritée — Gammes sans localisation propre

## Contexte

Actuellement, `gammes.id_local` permet d'assigner manuellement une localisation à une gamme. C'est redondant avec la liaison gamme ↔ équipements : chaque équipement a déjà un `id_local`. La localisation de la gamme devrait être **calculée automatiquement** à partir des équipements liés.

**Principe :** la gamme hérite la localisation de ses équipements via le LCA (plus petit ancêtre commun) de la hiérarchie bâtiment > niveau > local.

---

## Règles métier

### Calcul du LCA

| Situation | id_batiment_calc | id_niveau_calc | id_local_calc | Label (mono-bât) | Label (multi-bât) |
|-----------|-----------------|---------------|--------------|-------------------|-------------------|
| 0 équipements | NULL | NULL | NULL | NULL | NULL |
| Tous même local | ✓ | ✓ | ✓ | "Niveau - Local" | "Bâtiment - Niveau - Local" |
| Tous même niveau | ✓ | ✓ | NULL | "Niveau" | "Bâtiment - Niveau" |
| Tous même bâtiment | ✓ | NULL | NULL | "Bâtiment" | "Bâtiment" |
| Multi-bâtiments | NULL | NULL | NULL | NULL | NULL |

### Détection mono/multi-bâtiments
- `COUNT(DISTINCT b.id_batiment) = 1` → mono-bâtiment → label sans préfixe bâtiment
- `COUNT(DISTINCT b.id_batiment) > 1` → multi-bâtiments → label avec préfixe bâtiment
- `COUNT(DISTINCT b.id_batiment) = 0` → aucun équipement → tout NULL

### Moment du calcul
- **Trigger AFTER INSERT ON gammes_equipements** → recalcule
- **Trigger AFTER DELETE ON gammes_equipements** → recalcule
- **Trigger AFTER UPDATE ON equipements (id_local change)** → recalcule les gammes liées

### Snapshot OT
- `creation_ot_complet` : `nom_localisation = gammes.nom_localisation_calc`
- Plus besoin de JOIN locaux/niveaux/batiments dans le trigger OT

---

## Modifications schéma

### Table `gammes` — colonnes à modifier

**Supprimer :**
- `id_local INTEGER` (FK → locaux)

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

### Nouveaux triggers

**`calcul_localisation_gamme_insert`** — AFTER INSERT ON gammes_equipements
**`calcul_localisation_gamme_delete`** — AFTER DELETE ON gammes_equipements
**`calcul_localisation_gamme_equip_move`** — AFTER UPDATE OF id_local ON equipements

Chaque trigger exécute la même logique :

```sql
-- Pseudo-SQL du calcul LCA
WITH equip_locs AS (
    SELECT DISTINCT l.id_local, l.nom AS nom_local,
           n.id_niveau, n.nom AS nom_niveau,
           b.id_batiment, b.nom AS nom_batiment
    FROM gammes_equipements ge
    JOIN equipements e ON ge.id_equipement = e.id_equipement
    JOIN locaux l ON e.id_local = l.id_local
    JOIN niveaux n ON l.id_niveau = n.id_niveau
    JOIN batiments b ON n.id_batiment = b.id_batiment
    WHERE ge.id_gamme = :id_gamme
),
counts AS (
    SELECT COUNT(DISTINCT id_batiment) AS nb_bat,
           COUNT(DISTINCT id_niveau) AS nb_niv,
           COUNT(DISTINCT id_local) AS nb_loc
    FROM equip_locs
)
UPDATE gammes SET
    id_batiment_calc = CASE WHEN nb_bat = 1 THEN (SELECT id_batiment FROM equip_locs LIMIT 1) ELSE NULL END,
    id_niveau_calc   = CASE WHEN nb_niv = 1 THEN (SELECT id_niveau FROM equip_locs LIMIT 1) ELSE NULL END,
    id_local_calc    = CASE WHEN nb_loc = 1 THEN (SELECT id_local FROM equip_locs LIMIT 1) ELSE NULL END,
    nom_localisation_calc = CASE
        WHEN nb_loc = 0 THEN NULL
        WHEN nb_bat > 1 THEN NULL
        WHEN nb_bat = 1 AND nb_niv > 1 THEN (SELECT nom_batiment FROM equip_locs LIMIT 1)
        WHEN nb_niv = 1 AND nb_loc > 1 THEN
            CASE WHEN nb_bat = 1 THEN (SELECT nom_niveau FROM equip_locs LIMIT 1)
            ELSE (SELECT nom_batiment || ' - ' || nom_niveau FROM equip_locs LIMIT 1) END
        WHEN nb_loc = 1 THEN
            CASE WHEN nb_bat = 1 THEN (SELECT nom_niveau || ' - ' || nom_local FROM equip_locs LIMIT 1)
            ELSE (SELECT nom_batiment || ' - ' || nom_niveau || ' - ' || nom_local FROM equip_locs LIMIT 1) END
    END
WHERE id_gamme = :id_gamme;
```

### Triggers OT à simplifier

**`creation_ot_complet`** — snapshot simplifié :
```sql
nom_localisation = (SELECT nom_localisation_calc FROM gammes WHERE id_gamme = NEW.id_gamme)
```

**`reinitialisation_resurrection`** — idem

**`a_propagation_gamme_vers_ot`** — le bloc localisation propage `nom_localisation_calc` directement

**Supprimer les triggers de propagation renommage batiment/niveau/local → OT** (remplacés par la propagation via recalcul gamme)

Mais il faut ajouter : **propagation renommage → recalcul `nom_localisation_calc` des gammes** :
- AFTER UPDATE OF nom ON batiments → recalcule toutes les gammes qui ont id_batiment_calc = NEW.id_batiment
- AFTER UPDATE OF nom ON niveaux → recalcule toutes les gammes qui ont id_niveau_calc = NEW.id_niveau
- AFTER UPDATE OF nom ON locaux → recalcule toutes les gammes qui ont id_local_calc = NEW.id_local

Et ensuite la propagation gamme → OT existante (`a_propagation_gamme_vers_ot`) fait le reste.

---

## Impact fichiers

### Schema
- `src-tauri/schema.sql` : modifier gammes, ajouter 3 triggers LCA, adapter triggers OT, supprimer triggers propagation renommage → OT

### Migration (db.rs)
- v3 → v4 : recréer table gammes (supprimer id_local, ajouter 4 colonnes calc), recalculer toutes les gammes existantes

### Rust backend
- `models/gammes.rs` : supprimer `id_local`, ajouter 4 champs calc
- `commands/gammes.rs` : supprimer id_local du CRUD, ajouter les champs calc au SELECT
- `commands/localisations.rs` : inchangé

### Frontend
- `types/gammes.ts` : supprimer `id_local`, ajouter `nom_localisation_calc`
- `schemas/gammes.ts` : supprimer `id_local`
- `hooks/use-gammes.ts` : inchangé
- `pages/gammes/[id].tsx` : supprimer le select localisation du formulaire, afficher `nom_localisation_calc` dans la fiche info
- `pages/gammes/familles/[idFamille].tsx` : supprimer le select localisation du formulaire de création

---

## Étapes d'implémentation

1. **Schema SQL** — Modifier gammes + ajouter triggers LCA + adapter triggers OT
2. **Migration db.rs** — v3→v4
3. **Models + Commands Rust** — Adapter structs et requêtes
4. **Frontend** — Supprimer select localisation, afficher champ calculé
5. **Vérification** — Tests manuels + /borg
