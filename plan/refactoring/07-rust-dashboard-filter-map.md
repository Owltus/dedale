# Phase 7 — Fix perte silencieuse dashboard

## Contexte

Le fichier `src-tauri/src/commands/dashboard.rs` utilise `.filter_map(|r| r.ok())` **6 fois** pour collecter les résultats de requêtes SQL.

Ce pattern **ignore silencieusement** les lignes qui ne peuvent pas être mappées. Si une colonne retourne un type inattendu, la ligne disparaît du résultat sans aucune erreur — l'utilisateur voit un dashboard incomplet sans savoir pourquoi.

## Fix

Remplacer chaque occurrence :

```rust
// AVANT — perte silencieuse
.filter_map(|r| r.ok())
.collect();

// APRÈS — erreur propagée
.collect::<Result<Vec<_>, _>>()
.map_err(|e| e.to_string())?;
```

## Occurrences

| Ligne approximative | Contexte |
|---------------------|----------|
| 57-65 | `contrats_expirant_30j` |
| 78-86 | `ot_en_retard` |
| 94-102 | `ot_a_venir_7j` |
| 111-122 | `di_ouvertes_anciennes` |
| 130-139 | `gammes_inactives_avec_equipements` |
| 148-159 | `equipements_sans_gamme` |

## Fichiers impactés

| Couche | Fichiers | Action |
|--------|----------|--------|
| Rust commands | `dashboard.rs` | 6 remplacements |
| **Total** | **1 fichier** | Modifié |

## Vérification

1. **Compilation** : `cargo check` sans erreur
2. **Test fonctionnel** : page Dashboard — toutes les alertes et KPIs s'affichent correctement
3. **Test erreur** : si une colonne est corrompue, l'erreur est visible dans un toast (au lieu d'un dashboard silencieusement incomplet)
