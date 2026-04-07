# Refactoring Localisations — Bâtiments / Niveaux / Locaux

## Contexte

Actuellement, les localisations sont un arbre récursif libre (table `localisations` avec `id_parent`). L'utilisateur veut une hiérarchie structurée en 3 niveaux fixes :

```
Bâtiment A
├── RDC
│   ├── Hall
│   ├── Cuisine
│   └── Restaurant
├── Étage 1
│   ├── Chambre 101
│   └── Cage escalier A
└── Toiture terrasse
```

- **Mono-site** — l'établissement est géré dans Paramètres
- **3 nouvelles tables** : `batiments`, `niveaux`, `locaux`
- **Navigation par niveaux** : liste Bâtiments → clic → Niveaux du bâtiment → clic → Locaux du niveau
- Pattern identique aux pages Équipements (Domaine → Famille → Équipement)

---

## Architecture cible

```
batiments (id_batiment, nom, description, id_etablissement?)
└── niveaux (id_niveau, nom, description, id_batiment FK)
    └── locaux (id_local, nom, description, id_niveau FK)
```

**Décisions clés :**
- Les gammes et équipements pointent vers `id_local` (niveau le plus fin) — nullable
- Le snapshot OT `nom_localisation` stocke le chemin complet : "Bâtiment A > RDC > Cuisine"
- Les tables de liaison (di_localisations, documents_localisations) pointent vers `id_local`
- Unicité : `nom` unique par parent (pas globalement) — `UNIQUE(nom, id_batiment)` pour niveaux, `UNIQUE(nom, id_niveau)` pour locaux

---

## Impact

### Tables à créer (3)
- `batiments` — remplace les localisations racine
- `niveaux` — remplace les localisations de profondeur 1
- `locaux` — remplace les localisations de profondeur 2+

### Tables à modifier (4 FK vers localisations)
| Table | Colonne actuelle | Nouvelle colonne | ON DELETE |
|-------|-----------------|-----------------|-----------|
| `gammes` | `id_localisation` | `id_local` | RESTRICT |
| `equipements` | `id_localisation` | `id_local` | RESTRICT |
| `di_localisations` | `id_localisation` | `id_local` | CASCADE |
| `documents_localisations` | `id_localisation` | `id_local` | CASCADE |

### Table à supprimer
- `localisations` (après migration des données)

### Triggers à réécrire (4)
| Trigger | Impact |
|---------|--------|
| `creation_ot_complet` | Snapshot `nom_localisation` = chemin complet via `locaux → niveaux → batiments` |
| `propagation_renommage_localisation` | Dédoublé en 3 triggers (un par niveau) |
| `protection_cycle_localisation_*` | Supprimés (plus de récursion, hiérarchie fixe) |
| `nettoyage_document_orphelin_localisation` | Adapté pour `documents_localisations` avec `id_local` |

### Fichiers Rust (~10)
| Fichier | Changement |
|---------|-----------|
| `schema.sql` | 3 tables, triggers, index, migration |
| `db.rs` | Migration v2→v3 |
| `models/localisations.rs` | 3 structs (Batiment, Niveau, Local) |
| `commands/localisations.rs` | CRUD pour chaque niveau + arbre pour les selects |
| `commands/gammes.rs` | `id_localisation` → `id_local` |
| `commands/equipements.rs` | `id_localisation` → `id_local` |
| `commands/ordres_travail.rs` | Snapshot mis à jour |
| `commands/demandes.rs` | Junction `di_localisations.id_local` |
| `commands/documents.rs` | Junction `documents_localisations.id_local` |
| `commands/recherche.rs` | Recherche sur 3 tables |
| `commands/dashboard.rs` | Feature flag COUNT |
| `lib.rs` | Nouvelles commandes |

### Fichiers Frontend (~8)
| Fichier | Changement |
|---------|-----------|
| `types/localisations.ts` | 3 interfaces (Batiment, Niveau, Local) |
| `schemas/localisations.ts` | 3 schemas Zod |
| `hooks/use-localisations.ts` | CRUD hooks par niveau + tree helper |
| `pages/localisations/index.tsx` | Liste bâtiments (niveau 1) |
| `pages/localisations/batiments/[id].tsx` | **Nouveau** — Niveaux d'un bâtiment |
| `pages/localisations/niveaux/[id].tsx` | **Nouveau** — Locaux d'un niveau |
| `pages/gammes/[id].tsx` | Select localisation → select local |
| `pages/gammes/familles/[idFamille].tsx` | Idem |
| `pages/equipements/familles/[idFamille].tsx` | Idem |
| `types/gammes.ts`, `types/equipements.ts` | `id_localisation` → `id_local` |
| `schemas/gammes.ts`, `schemas/equipements.ts` | Idem |

---

## Étapes d'implémentation

### Étape 1 — Schema SQL v3
- Créer `batiments`, `niveaux`, `locaux`
- Modifier FK dans gammes, equipements, di_localisations, documents_localisations
- Réécrire triggers snapshot et propagation
- Supprimer `localisations` et ses triggers/index

### Étape 2 — Migration db.rs (v2→v3)
- Détecter via `PRAGMA user_version` (2 → 3)
- Créer nouvelles tables
- Migrer données : localisations depth=0 → batiments, depth=1 → niveaux, depth=2+ → locaux
- Mettre à jour FK dans gammes, equipements, etc.
- Supprimer ancienne table

### Étape 3 — Models Rust
- 3 structs : `Batiment`, `Niveau`, `Local`
- 3 inputs : `BatimentInput`, `NiveauInput`, `LocalInput`

### Étape 4 — Commands localisations.rs
- CRUD bâtiments (5 commandes)
- CRUD niveaux (5 commandes)
- CRUD locaux (5 commandes)
- Helper `get_localisations_tree` pour les selects (retourne arbre aplati pour les dropdowns)

### Étape 5 — Commands secondaires
- gammes.rs, equipements.rs : `id_localisation` → `id_local`
- ordres_travail.rs : snapshot adapté
- demandes.rs, documents.rs : junction tables
- recherche.rs, dashboard.rs

### Étape 6 — lib.rs
- Enregistrer ~15 nouvelles commandes

### Étape 7 — Frontend types/schemas/hooks

### Étape 8 — Frontend pages
- `localisations/index.tsx` → liste bâtiments
- **Nouveau** `localisations/batiments/[id].tsx` → niveaux
- **Nouveau** `localisations/niveaux/[id].tsx` → locaux
- Mettre à jour les selects localisation dans gammes/équipements

### Étape 9 — Vérification

---

## Vérification

```bash
cargo check
npx tsc --noEmit
npm run tauri dev
```

Tests manuels :
1. Créer bâtiment → niveaux → locaux
2. Lier un local à une gamme → créer OT → vérifier snapshot "Bât A > RDC > Cuisine"
3. Renommer un local → OT actifs mis à jour
4. Supprimer un local lié à un équipement → bloqué (RESTRICT)
5. Recherche globale → trouve bâtiments, niveaux, locaux
