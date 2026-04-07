# Étape 1 — Schema SQL v3

## Objectif
Réécrire `schema.sql` : remplacer la table récursive `localisations` par 3 tables fixes `batiments`, `niveaux`, `locaux`.

## Fichier impacté
- `src-tauri/schema.sql`

## Travail à réaliser

### 1. Créer `batiments`
```sql
CREATE TABLE batiments (
    id_batiment   INTEGER PRIMARY KEY AUTOINCREMENT,
    nom           TEXT NOT NULL UNIQUE,
    description   TEXT,
    date_creation TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification TEXT DEFAULT CURRENT_TIMESTAMP
) STRICT;
```

### 2. Créer `niveaux`
```sql
CREATE TABLE niveaux (
    id_niveau     INTEGER PRIMARY KEY AUTOINCREMENT,
    nom           TEXT NOT NULL,
    description   TEXT,
    id_batiment   INTEGER NOT NULL,
    date_creation TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_batiment) REFERENCES batiments(id_batiment) ON DELETE RESTRICT,
    UNIQUE(nom, id_batiment)
) STRICT;
```

### 3. Créer `locaux`
```sql
CREATE TABLE locaux (
    id_local      INTEGER PRIMARY KEY AUTOINCREMENT,
    nom           TEXT NOT NULL,
    description   TEXT,
    id_niveau     INTEGER NOT NULL,
    date_creation TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_niveau) REFERENCES niveaux(id_niveau) ON DELETE RESTRICT,
    UNIQUE(nom, id_niveau)
) STRICT;
```

### 4. Supprimer `localisations`
- DROP TABLE localisations (après migration données)

### 5. Modifier FK dans les tables existantes
| Table | Avant | Après |
|-------|-------|-------|
| `gammes` | `id_localisation → localisations` | `id_local → locaux` (nullable, RESTRICT) |
| `equipements` | `id_localisation → localisations` | `id_local → locaux` (nullable, RESTRICT) |
| `di_localisations` | `id_localisation → localisations` | `id_local → locaux` (CASCADE) |
| `documents_localisations` | `id_localisation → localisations` | `id_local → locaux` (CASCADE) |

### 6. Supprimer triggers obsolètes
- `protection_cycle_localisation_insert` — plus de récursion
- `protection_cycle_localisation_update` — plus de récursion

### 7. Réécrire triggers

**`creation_ot_complet`** — snapshot `nom_localisation` :
```sql
nom_localisation = (
    SELECT b.nom || ' > ' || n.nom || ' > ' || l.nom
    FROM gammes g
    LEFT JOIN locaux l ON g.id_local = l.id_local
    LEFT JOIN niveaux n ON l.id_niveau = n.id_niveau
    LEFT JOIN batiments b ON n.id_batiment = b.id_batiment
    WHERE g.id_gamme = NEW.id_gamme
),
```

**`reinitialisation_resurrection`** — même logique que ci-dessus

**Propagation renommage** — 3 triggers séparés :
- `propagation_renommage_batiment` → recalcule le chemin complet dans les OT actifs
- `propagation_renommage_niveau` → idem
- `propagation_renommage_local` → idem

**`nettoyage_document_orphelin_localisation`** — adapter pour `documents_localisations.id_local`

### 8. Nouveaux index
```sql
CREATE INDEX idx_niveaux_batiment ON niveaux(id_batiment);
CREATE INDEX idx_locaux_niveau ON locaux(id_niveau);
CREATE INDEX idx_gammes_local ON gammes(id_local);
CREATE INDEX idx_equipements_local ON equipements(id_local);
```

### 9. Supprimer anciens index
- `idx_localisations_parent`
- `idx_localisations_etablissement`
- `idx_gammes_localisation`
- `idx_equipements_localisation`

## Critère de validation
- SQL syntaxiquement valide
- Aucune référence à `localisations` (sauf commentaires)
- Toutes les FK cohérentes

## Contrôle /borg
Vérifier cohérence FK, triggers, index. Pas de table orpheline.
