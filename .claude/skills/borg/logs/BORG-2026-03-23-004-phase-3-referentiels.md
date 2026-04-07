# BORG-2026-03-23-004 — Phase 3 Parametres & Referentiels

> Projet : GMAO Desktop — Tauri v2 + React 19 + TypeScript 6 + SQLite
> Drones deployes : Sept-de-Neuf, Quatre-de-Cinq, Six-de-Neuf
> Mode : DIAGNOSTIC + EXECUTION (corrections critiques)

## Contexte

Audit Phase 3 : 35 commandes CRUD Rust + 9 onglets parametres frontend. ~2450 LOC, 15 fichiers.

## Rapports des drones

### Sept-de-Neuf (Conformite)
- 70/72 regles verifiees : 97.2% conforme
- Deviations mineures : CrudTab 199 LOC (limite 150), form.watch() au lieu de useWatch()
- Backend Rust : 100% conforme (Result<T,String>, prepare_cached, params![], lock minimal)
- TanStack Query : 100% conforme (hooks custom, staleTime, onSettled)
- Zod/Forms : 100% conforme (mirror SQL CHECK, z.coerce, .refine cross-field)

### Quatre-de-Cinq (Failles)
- 7 failles rapportees dont 1 CRITIQUE confirmee
- CRITIQUE : colonne SQL mismatch modeles_di (resolution_suggeree vs description_resolution)
- HAUTE : editingRow non-nettoye, as never type assertions
- MOYENNE : FK RESTRICT erreurs brutes, form reset incomplet

### Six-de-Neuf (Contradicteur)
- Confirme CRITIQUE 1 (colonne mismatch)
- Decouvre CRITIQUE 2 (nom_modele NOT NULL manquant du code)
- Downgrade HAUTE editingRow a BASSE (handleCreate/handleEdit reset correctement)
- Confirme MOYENNES (as never, FK errors)

## Verdict unifie

CRITIQUES CORRIGEES : 2
1. modeles_di : resolution_suggeree → description_resolution (colonne SQL correcte)
2. modeles_di : nom_modele + description ajoutes au modele Rust, commandes SQL, types TS, schema Zod, hooks, et composant frontend

MOYENNES non corrigees (acceptables) : 3
- as never type assertions (pragmatique pour Zod v4 + react-hook-form)
- FK RESTRICT erreurs brutes (schema SQL ne fournit pas de trigger de protection pour toutes les tables)
- CrudTab 199 LOC (justifie pour composant generique)

BASSES non corrigees : 2
- form.watch() au lieu de useWatch()
- editingRow non-nettoye (impact nul)

## Actions executees

1. src-tauri/src/models/referentiels.rs :
   - ModeleDi : ajoute nom_modele, description, date_creation; renomme resolution_suggeree → description_resolution
   - ModeleDiInput : ajoute nom_modele, description; renomme resolution_suggeree → description_resolution; description_constat passe de Option<String> a String

2. src-tauri/src/commands/referentiels.rs :
   - get_modeles_di : SELECT corrige avec toutes les colonnes schema.sql
   - create_modele_di : INSERT avec nom_modele, description, description_resolution
   - update_modele_di : UPDATE avec tous les champs
   - Helper map_modele_di() + constante MODELE_DI_SELECT

3. src/lib/types/referentiels.ts :
   - ModeleDi : ajoute nom_modele, description, date_creation; renomme; description_constat: string (non nullable)

4. src/lib/schemas/referentiels.ts :
   - modeleDiSchema : ajoute nom_modele, description; description_constat required; renomme

5. src/hooks/use-referentiels.ts :
   - useCreateModeleDi/useUpdateModeleDi : input type corrige

6. src/pages/parametres/ModelesDiTab.tsx :
   - Formulaire complet avec nom_modele, description, tous les champs corriges
   - Colonnes table mises a jour

7. Verification : npx tsc --noEmit OK, cargo check OK
