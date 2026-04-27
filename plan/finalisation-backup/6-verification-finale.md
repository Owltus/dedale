# Étape 6 — Vérification finale

## Objectif

Confirmer que les modifications des étapes 2, 3, 4, 5 compilent et passent les types, et mettre à jour le log Borg pour refléter les améliorations apportées.

## Fichier(s) impacté(s)

- `.claude/skills/borg/logs/BORG-2026-04-27-001-backup-freeze.md` (ajout d'une section « Suite — Améliorations non critiques »)

## Travail à réaliser

### 1. Compilation Rust

```bash
cd src-tauri
cargo check
```

Doit afficher `Finished` sans warning nouveau. Si warning ou erreur, identifier et corriger avant de continuer.

### 2. Type-check TypeScript

```bash
npx tsc --noEmit
```

Doit être silencieux. Si erreur, identifier et corriger.

### 3. Mettre à jour le log Borg

Ajouter une section en fin de `BORG-2026-04-27-001-backup-freeze.md` :

```markdown
## Suite — Améliorations non critiques (date d'ajout)

Après le test de validation manuel confirmant la disparition du freeze, les améliorations suivantes ont été appliquées via le plan `plan/finalisation-backup/` :

- Helper `apply_pragmas_snapshot` extrait dans `db.rs` ; appliqué sur les 3 connexions read-only de la feature backup (snapshot src+dst, read_snapshot_stats, validate_pending_db)
- Pause TanStack Query pendant `backup_create` : `cancelQueries` dans `onMutate` sur les 7 namespaces lourds (dashboard, planning, ordres-travail, gammes, contrats, equipements, localisations), refetch via `invalidateQueries` dans `onSettled`
- Logs de timing par phase via `log::info!` dans `backup_create_blocking`, `backup_restore_blocking`, `restore_pre_restore_blocking` ; niveau release passé à `Info`
- Pattern « Commandes longues : async + spawn_blocking » documenté dans `.claude/rules/rust-backend.md`

Le Collectif considère la feature comme assimilée et conforme.
```

### 4. (Optionnel) Test fumée

Relancer un backup et vérifier que tout fonctionne toujours fonctionnellement :
- Création d'un backup → toast de succès, fichier zip créé
- Inspection d'un backup créé précédemment → manifest lisible
- Si possible : restauration sur une copie de la base

## Critère de validation

- `cargo check` : Finished sans erreur ni warning nouveau
- `npx tsc --noEmit` : silencieux
- Log Borg mis à jour avec la section « Suite »
- (Optionnel) Test fumée : un backup fonctionnel
