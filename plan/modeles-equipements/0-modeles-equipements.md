# Modeles d'equipement — Champs personnalises par type d'equipement

## Contexte

Tous les equipements partagent les memes champs fixes (nom, marque, modele, numero de serie, dates, localisation). Or un extincteur, une chaudiere et un detecteur incendie ont des caracteristiques techniques radicalement differentes.

**Probleme :** impossible de stocker "puissance en kW", "type de combustible" ou "type de detection" sans modifier le schema a chaque nouveau type d'equipement.

**Solution :** un systeme de **modeles d'equipement** qui definit des champs personnalises par type. Le modele est lie a une famille d'equipements — tous les equipements de cette famille heritent des memes champs a remplir.

---

## Architecture cible

```
modeles_equipements              familles_equipements
  ├── champs_modele   ◄────────── id_modele_equipement (FK optionnelle)
  │   (definitions)                   │
  │                                   └── equipements
  │                                         │
  └── valeurs_equipements ──────────────────┘
      (valeurs par equipement par champ)
```

**Regles :**
- 1 modele = 1 ensemble de champs personnalises (nom, type, unite, obligatoire, ordre)
- 1 famille peut avoir 0 ou 1 modele
- 1 modele peut etre utilise par plusieurs familles
- Chaque equipement stocke ses valeurs dans `valeurs_equipements` (1 ligne par champ rempli)
- Les champs de base (nom, marque, localisation...) ne changent pas — les champs personnalises s'ajoutent

**Types de champs supportes :**
| Type | Saisie | Stockage |
|------|--------|----------|
| `texte` | Champ texte libre | TEXT |
| `nombre` | Input numerique + unite optionnelle | TEXT (valide comme nombre) |
| `date` | Date picker | TEXT (YYYY-MM-DD) |
| `booleen` | Switch oui/non | TEXT ("0" ou "1") |
| `liste` | Select parmi valeurs predefinies | TEXT (la valeur choisie) |

---

## Phases

| Etape | Fichier | Contenu |
|-------|---------|---------|
| 1 | `1-schema-sql.md` | Tables SQL + index + triggers |
| 2 | `2-seed.md` | Donnees de test (3 modeles avec champs) |
| 3 | `3-models-rust.md` | Structs Rust (serde) |
| 4 | `4-commands-rust.md` | Commandes Tauri (CRUD modeles/champs + valeurs equipements) |
| 5 | `5-lib-registration.md` | Enregistrement des commandes dans lib.rs |
| 6 | `6-frontend-types-schemas-hooks.md` | Types TS + schemas Zod + hooks TanStack Query |
| 7 | `7-frontend-pages.md` | Pages modeles-equipements + modification equipement detail |
| 8 | `8-verification.md` | Tests manuels et commandes de verification |

---

## Fichiers impactes (resume)

| Couche | Fichiers |
|--------|----------|
| SQL | `schema.sql`, `seed.sql` |
| Rust models | `models/modeles_equipements.rs` (NOUVEAU), `models/equipements.rs` (modifie) |
| Rust commands | `commands/modeles_equipements.rs` (NOUVEAU), `commands/equipements.rs` (modifie) |
| Rust config | `lib.rs` |
| Types TS | `lib/types/equipements.ts` (NOUVEAU ou modifie) |
| Schemas | `lib/schemas/equipements.ts` (modifie) |
| Hooks | `hooks/use-modeles-equipements.ts` (NOUVEAU), `hooks/use-equipements.ts` (modifie) |
| Pages | `pages/modeles-equipements/index.tsx` (NOUVEAU), `pages/modeles-equipements/[id].tsx` (NOUVEAU), `pages/equipements/[id].tsx` (modifie) |
| Navigation | `router.tsx`, `Sidebar.tsx` |
| DB | `db.rs` (version schema) |
| **Total** | **~12 fichiers modifies, ~5 nouveaux fichiers** |

---

## Ordre d'execution

```
1. schema.sql (nouvelles tables + modification familles_equipements)
2. seed.sql (donnees de test)
3. db.rs (bump version schema)
4. models/modeles_equipements.rs (structs)
5. models/equipements.rs (ajout id_modele_equipement a Famille)
6. commands/modeles_equipements.rs (CRUD)
7. commands/equipements.rs (modification CRUD familles)
8. lib.rs (enregistrement commandes)
9. Types + Schemas + Hooks frontend
10. Pages frontend + navigation
11. Tests manuels
```
