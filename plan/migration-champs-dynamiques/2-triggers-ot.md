# Etape 2 — Reecriture des triggers OT (snapshots equipement)

## Objectif
Adapter les 4 triggers lies aux snapshots d'equipement dans les ordres de travail. Les colonnes `equipements.nom` et `equipements.numero_serie` n'existent plus. Le snapshot utilise desormais `equipements.nom_affichage` (cache calcule). La colonne `numero_serie_equipement` est supprimee de `ordres_travail`.

## Fichiers impactes
- `src-tauri/schema.sql` (triggers)
- `src-tauri/schema.sql` (table `ordres_travail` — suppression colonne)
- `src-tauri/src/models/ordres_travail.rs` (retrait champ)
- `src-tauri/src/commands/ordres_travail.rs` (retrait colonne SELECT)
- `src/lib/types/ordres-travail.ts` (retrait champ)
- `src/pages/ordres-travail/[id].tsx` (retrait affichage)

## Decision prealable : suppression de `numero_serie_equipement`

### Contexte
La colonne `ordres_travail.numero_serie_equipement` est un snapshot du `numero_serie` de l'equipement au moment de la creation de l'OT. Avec la migration vers les champs dynamiques, le numero de serie n'est plus une colonne fixe de `equipements` — c'est un champ du modele, defini dans `champs_modele` et stocke dans `valeurs_equipements`.

### Probleme
- Le numero de serie n'est plus garanti d'exister (c'est un champ optionnel du modele)
- Pour le snapshotter, il faudrait chercher dans `valeurs_equipements` un champ nomme "N. serie" ou "Numero de serie" — fragile et dependant du nommage choisi par l'utilisateur dans le modele
- L'information n'a plus de sens universel si elle n'est pas presente sur tous les equipements

### Decision
**Supprimer la colonne `numero_serie_equipement` de `ordres_travail`.**

L'information reste accessible en consultation via la fiche equipement (lien vivant `gammes` -> `equipements` -> `valeurs_equipements`). Si un historique est necessaire, les valeurs dans `valeurs_equipements` sont conservees.

---

## Travail a realiser

### 2.1 Suppression de la colonne `numero_serie_equipement` (table)

Dans la definition de `ordres_travail` (ligne ~648 actuelle), supprimer :

```sql
-- AVANT
    nom_equipement             TEXT,
    numero_serie_equipement    TEXT,

-- APRES
    nom_equipement             TEXT,
```

### 2.2 Trigger `creation_ot_complet` (AFTER INSERT ON ordres_travail)

**Localisation :** ligne ~1718 actuelle.

**Changements :**

1. **Snapshot `nom_equipement`** : remplacer `e.nom` par `e.nom_affichage`

```sql
-- AVANT
        nom_equipement = (
            SELECT e.nom
            FROM equipements e
            JOIN gammes g ON g.id_equipement = e.id_equipement
            WHERE g.id_gamme = NEW.id_gamme
        ),
        numero_serie_equipement = (
            SELECT e.numero_serie
            FROM equipements e
            JOIN gammes g ON g.id_equipement = e.id_equipement
            WHERE g.id_gamme = NEW.id_gamme
        ),

-- APRES
        nom_equipement = (
            SELECT e.nom_affichage
            FROM equipements e
            JOIN gammes g ON g.id_equipement = e.id_equipement
            WHERE g.id_gamme = NEW.id_gamme
        ),
```

2. Supprimer entierement le bloc `numero_serie_equipement = (...)`.

**Rien d'autre ne change** dans ce trigger — les snapshots gamme, prestataire, technicien, poste restent identiques.

### 2.3 Trigger `reinitialisation_resurrection` (AFTER UPDATE ON ordres_travail, 4->1)

**Localisation :** ligne ~2178 actuelle.

**Changements identiques a 2.2 :**

```sql
-- AVANT (lignes ~2267-2278)
        nom_equipement = (
            SELECT e.nom
            FROM equipements e
            JOIN gammes g ON g.id_equipement = e.id_equipement
            WHERE g.id_gamme = NEW.id_gamme
        ),
        numero_serie_equipement = (
            SELECT e.numero_serie
            FROM equipements e
            JOIN gammes g ON g.id_equipement = e.id_equipement
            WHERE g.id_gamme = NEW.id_gamme
        ),

-- APRES
        nom_equipement = (
            SELECT e.nom_affichage
            FROM equipements e
            JOIN gammes g ON g.id_equipement = e.id_equipement
            WHERE g.id_gamme = NEW.id_gamme
        ),
```

### 2.4 Trigger `propagation_equipement_vers_ot` (AFTER UPDATE ON equipements)

**Localisation :** ligne ~2746 actuelle.

**Changements :**

1. **Condition WHEN** : remplacer le test sur `nom` et `numero_serie` par un test sur `nom_affichage`
2. **Corps** : propager `nom_affichage` au lieu de `nom` + `numero_serie`

```sql
-- AVANT
DROP TRIGGER IF EXISTS propagation_equipement_vers_ot;
CREATE TRIGGER propagation_equipement_vers_ot
AFTER UPDATE ON equipements
FOR EACH ROW
WHEN OLD.nom != NEW.nom OR OLD.numero_serie IS NOT NEW.numero_serie
BEGIN
    UPDATE ordres_travail
    SET
        nom_equipement          = NEW.nom,
        numero_serie_equipement = NEW.numero_serie
    WHERE id_statut_ot NOT IN (3, 4)
      AND id_gamme IN (
          SELECT id_gamme FROM gammes WHERE id_equipement = NEW.id_equipement
      );
END;

-- APRES
DROP TRIGGER IF EXISTS propagation_equipement_vers_ot;
CREATE TRIGGER propagation_equipement_vers_ot
AFTER UPDATE ON equipements
FOR EACH ROW
WHEN OLD.nom_affichage IS NOT NEW.nom_affichage
BEGIN
    UPDATE ordres_travail
    SET nom_equipement = NEW.nom_affichage
    WHERE id_statut_ot NOT IN (3, 4)
      AND id_gamme IN (
          SELECT id_gamme FROM gammes WHERE id_equipement = NEW.id_equipement
      );
END;
```

**Note :** on utilise `IS NOT` au lieu de `!=` car `nom_affichage` est NOT NULL, mais par coherence avec les autres triggers du schema (et pour se premunir d'un eventuel changement), `IS NOT` est plus sur.

### 2.5 Trigger `protection_ot_terminaux` (BEFORE UPDATE ON ordres_travail)

**Localisation :** ligne ~1003 actuelle.

**Changements :**

Retirer `numero_serie_equipement` de la blacklist (la colonne n'existe plus).

```sql
-- AVANT (lignes ~1027-1028)
        OR OLD.nom_equipement      IS NOT NEW.nom_equipement
        OR OLD.numero_serie_equipement IS NOT NEW.numero_serie_equipement

-- APRES
        OR OLD.nom_equipement      IS NOT NEW.nom_equipement
```

### 2.6 Trigger `a_propagation_gamme_vers_ot` (AFTER UPDATE ON gammes)

**Localisation :** ligne ~2483 actuelle.

**Changements dans le bloc "Equipement (si modifie)" (lignes ~2525-2532) :**

```sql
-- AVANT
    -- Equipement (si modifie)
    UPDATE ordres_travail
    SET
        nom_equipement          = (SELECT e.nom          FROM equipements e WHERE e.id_equipement = NEW.id_equipement),
        numero_serie_equipement = (SELECT e.numero_serie FROM equipements e WHERE e.id_equipement = NEW.id_equipement)
    WHERE id_gamme = NEW.id_gamme
      AND id_statut_ot NOT IN (3, 4)
      AND (OLD.id_equipement IS NOT NEW.id_equipement);

-- APRES
    -- Equipement (si modifie)
    UPDATE ordres_travail
    SET nom_equipement = (SELECT e.nom_affichage FROM equipements e WHERE e.id_equipement = NEW.id_equipement)
    WHERE id_gamme = NEW.id_gamme
      AND id_statut_ot NOT IN (3, 4)
      AND (OLD.id_equipement IS NOT NEW.id_equipement);
```

---

## Modifications Rust

### 2.7 Model `ordres_travail.rs`

Retirer le champ :

```rust
// SUPPRIMER
pub numero_serie_equipement: Option<String>,
```

### 2.8 Command `ordres_travail.rs`

1. Retirer `numero_serie_equipement` de la constante `OT_COLS` (ligne ~23)
2. Ajuster les index de `row.get()` dans la fonction de mapping — tous les index apres `nom_equipement` (actuellement 25) reculent de 1

```rust
// AVANT (extrait)
const OT_COLS: &str = "\
    ...nom_poste, nom_equipement, numero_serie_equipement, \
    date_creation, date_modification";

// APRES
const OT_COLS: &str = "\
    ...nom_poste, nom_equipement, \
    date_creation, date_modification";
```

**Attention :** verifier que TOUS les `row.get(N)?` sont reajustes. Le nombre total de colonnes passe de 28 a 27.

---

## Modifications Frontend

### 2.9 Types `ordres-travail.ts`

Retirer le champ :

```typescript
// SUPPRIMER
numero_serie_equipement: string | null;
```

### 2.10 Page detail OT `[id].tsx`

Ligne ~208 actuelle — simplifier l'affichage equipement :

```typescript
// AVANT
{ label: "Equipement", value: ot.nom_equipement
    ? `${ot.nom_equipement} ${ot.numero_serie_equipement ? `(${ot.numero_serie_equipement})` : ""}`
    : null },

// APRES
{ label: "Equipement", value: ot.nom_equipement },
```

---

## Resume des modifications

| Trigger / Fichier | Modification |
|---|---|
| `creation_ot_complet` | `e.nom` -> `e.nom_affichage`, retrait `numero_serie_equipement` |
| `reinitialisation_resurrection` | Idem |
| `propagation_equipement_vers_ot` | WHEN sur `nom_affichage`, SET `nom_affichage` seul |
| `protection_ot_terminaux` | Retrait `numero_serie_equipement` de la blacklist |
| `a_propagation_gamme_vers_ot` | Bloc equipement : `e.nom_affichage` seul |
| Table `ordres_travail` | Suppression colonne `numero_serie_equipement` |
| `models/ordres_travail.rs` | Retrait champ struct |
| `commands/ordres_travail.rs` | Retrait colonne SELECT + reindex |
| `lib/types/ordres-travail.ts` | Retrait champ type |
| `pages/ordres-travail/[id].tsx` | Simplification affichage equipement |

## Critere de validation
- Le fichier `schema.sql` est syntaxiquement valide (pas d'erreur a l'init)
- `npx tsc --noEmit` passe sans erreur
- Creer un OT -> `nom_equipement` contient la valeur de `nom_affichage` de l'equipement lie
- Renommer un equipement (changement de valeur du champ d'affichage) -> les OT actifs sont mis a jour
- Les OT clotures/annules ne sont pas impactes par la propagation
- La resurrection (4->1) regenere correctement le snapshot avec `nom_affichage`
- Aucune reference a `numero_serie_equipement` ne subsiste dans le code

## Ordre d'execution
1. Modifier la table `ordres_travail` (retrait colonne)
2. Reecrire les 5 triggers dans `schema.sql`
3. Modifier le model + command Rust
4. Modifier les types + la page frontend
5. Verifier `tsc --noEmit` + test manuel
