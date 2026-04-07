# Phase 2 — Remplacer Vec loop par .collect()

## Contexte

46 fonctions dans `commands/` utilisent un pattern verbeux de 4 lignes pour collecter les résultats de requêtes SQL :

```rust
// AVANT — 4 lignes
let mut result = Vec::new();
for row in rows {
    result.push(row.map_err(|e| e.to_string())?);
}
Ok(result)
```

Peut être remplacé par le pattern idiomatique Rust :

```rust
// APRÈS — 1 ligne
rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
```

## Fichiers impactés

| Fichier | Occurrences |
|---------|-------------|
| `referentiels.rs` | 11 |
| `equipements.rs` | 9 |
| `localisations.rs` | 3 |
| `techniciens.rs` | 2 |
| `images.rs` | 1 |
| `gammes.rs` | ~8 |
| `ordres_travail.rs` | 3 |
| `demandes.rs` | 4 |
| `documents.rs` | 4 |
| `planning.rs` | 3 |
| `modeles_equipements.rs` | 2 |
| `modeles_operations.rs` | 2 |
| `recherche.rs` | 1 |
| `export.rs` | 3 |
| **Total** | **~46 occurrences dans 14 fichiers** |

## Ordre d'exécution

1. Pour chaque fichier, rechercher le pattern `let mut result = Vec::new();`
2. Remplacer le bloc 4 lignes par `.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())`
3. `cargo check` après chaque fichier modifié
4. Vérification finale : `cargo check` global — 0 erreur

## Règle de remplacement

**Avant :**
```rust
let rows = stmt
    .query_map(params, |row| { Ok(Struct { ... }) })
    .map_err(|e| e.to_string())?;

let mut result = Vec::new();
for row in rows {
    result.push(row.map_err(|e| e.to_string())?);
}
Ok(result)
```

**Après :**
```rust
stmt
    .query_map(params, |row| { Ok(Struct { ... }) })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())
```

## Exception

Le fichier `dashboard.rs` utilise `.filter_map(|r| r.ok())` au lieu du pattern Vec loop — c'est un problème différent traité en **Phase 7**.

## Vérification

1. **Compilation** : `cargo check` sans erreur
2. **Pas de changement de comportement** : même résultat (Vec de résultats ou première erreur propagée)
