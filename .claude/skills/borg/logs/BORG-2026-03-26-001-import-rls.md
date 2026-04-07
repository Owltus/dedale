# BORG-2026-03-26-001 — Import CSV + RLS daily_reports

> Projet : React + TypeScript + Supabase (SPA Vite)
> Drones deployes : 5 (Trois-de-Cinq, Sept-de-Neuf, Deux-de-Cinq, Quatre-de-Cinq, Six-de-Neuf)
> Mode : DIAGNOSTIC

## Contexte

L'utilisateur obtient l'erreur :
```
Erreur sauvegarde rapport : new row violates row-level security policy (USING expression) for table "daily_reports"
```

## Rapports des drones

### Drone 1 — Trois-de-Cinq (Cartographe)

Flux d'import cartographie :
```
NightPage.tsx (UI) → handleImport()
  ├→ processImport(file1, file2, userId) [orchestrator.ts]
  │   ├→ detectFileType() [detect.ts]
  │   ├→ extractReportDate() [date.ts]
  │   ├→ parseComparison() [comparison.ts]
  │   ├→ parseForecast() [forecast.ts]
  │   ├→ computeRealiseJour/MTD/ProjeteMois [kpi.ts]
  │   ├→ validateCoherence() [validate.ts]
  │   ├→ computeEcart() [ecart.ts]
  │   ├→ supabase.from('budget').select() — RLS: all read ✓
  │   ├→ supabase.from('daily_reports').upsert() — RLS: INSERT ✓ UPDATE ✗
  │   ├→ supabase.from('forecast_days').upsert() — RLS: INSERT ✓ UPDATE ✗
  │   └→ supabase.storage.upload() — archivage non-bloquant
  └→ processComparisonOnly(file, userId) — meme flux sans forecast
```

Couplage critique identifie : UPSERT = INSERT + UPDATE, mais policies RLS asymetriques.

### Drone 2 — Sept-de-Neuf (Conformite)

| Operation DB | Fichier:Ligne | Role(s) | Policy INSERT | Policy UPDATE | Statut |
|---|---|---|---|---|---|
| UPSERT daily_reports | orchestrator.ts:105 | super_utilisateur, admin | ✓ SuperUser/Admin | ✗ Admin only | **DEVIATION** |
| UPSERT daily_reports | orchestrator.ts:223 | super_utilisateur, admin | ✓ SuperUser/Admin | ✗ Admin only | **DEVIATION** |
| UPSERT forecast_days | orchestrator.ts:242 | super_utilisateur, admin | ✓ SuperUser/Admin | ✗ Admin only | **DEVIATION** |
| SELECT daily_reports | data.ts:22 | tous | ✓ All read | N/A | CONFORME |
| SELECT budget | orchestrator.ts:41 | super_utilisateur, admin | ✓ All read | N/A | CONFORME |
| UPDATE daily_reports | data.ts:58 | admin | N/A | ✓ Admin update | CONFORME |
| DELETE daily_reports | data.ts:53 | admin | N/A | ✓ Admin deletes | CONFORME |

**Cause racine identifiee** : PostgreSQL UPSERT = INSERT ... ON CONFLICT DO UPDATE.
- Si la date n'existe pas → INSERT → policy super_utilisateur OK
- Si la date existe → UPDATE → policy admin-only → **BLOQUE super_utilisateur**

### Drone 3 — Deux-de-Cinq (Resilience)

- **Zero tests** dans le projet (aucun .test.ts, .spec.ts, __tests__/)
- Trous critiques : CSV malformes non detectes, division par zero possible dans kpi.ts, NaN propagation silencieuse
- 10+ cas limites non proteges dans les parsers

### Drone 4 — Quatre-de-Cinq (Failles)

Failles confirmees :
1. **CRITIQUE** : userId (imported_by) non valide cote serveur — falsification possible
2. **HAUTE** : Race condition sur UPSERT concurrent meme date
3. **MOYENNE-HAUTE** : Donnees numeriques non validees cote serveur
4. **MOYENNE** : forecast_days sans imported_by (tracabilite)

### Drone 5 — Six-de-Neuf (Contradicteur)

**Confirmations** : Trouvailles 1-4, 6-7 toutes confirmees apres lecture directe du code source.

**Faux positif elimine** : .env.local n'est PAS tracked par git (*.local dans .gitignore). ANON_KEY est publique par design Supabase.

**Angles morts decouverts** :
1. Aucune RLS forcant imported_by = auth.uid()
2. daily_reports et forecast_days decouplees (pas de transaction)
3. Duplication logique entre processImport et processComparisonOnly
4. Zero audit trail / logging des tentatives

## Verdict unifie

Voir Phase 4 du message principal.

## Actions executees

Diagnostic uniquement.
