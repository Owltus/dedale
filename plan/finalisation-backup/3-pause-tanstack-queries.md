# Étape 3 — Pause TanStack Query pendant le backup

## Objectif

Réduire la charge IPC pendant un backup long : pendant la durée d'exécution de `backup_create`, suspendre les queries TanStack actives (Dashboard, Planning, OT, etc.) qui pourraient s'exécuter en parallèle et encombrer la file IPC Tauri. C'est un palliatif optionnel — le freeze critique est déjà résolu par les fixes async — mais améliore la fluidité sur très grosses bases.

## Contexte

Selon la cartographie du Collectif Borg (rapport Trois-de-Cinq) :
- ~8-15 queries actives potentielles pendant un backup (dashboard, planning, ordres-travail, gammes, contrats, équipements, localisations, recherche-globale)
- Sans cancellation, chaque query attend `db.lock()` derrière le backup → contention IPC
- Le `QueryClient` est instancié dans `src/main.tsx:9-16` avec `retry: false` → pas de refetch sauvage après cancel

La règle `.claude/rules/tanstack-query.md` autorise déjà `cancelQueries` dans `onMutate`. On étend ce pattern à `useBackupCreate`.

## Fichier(s) impacté(s)

- `src/hooks/use-backup.ts`

## Travail à réaliser

### 1. Étendre `useBackupCreate`

Ajouter un `onMutate` qui cancelle les queries lourdes, et un `onSettled` qui les invalide pour refetch après succès :

```typescript
export function useBackupCreate() {
  const qc = useQueryClient();
  return useInvokeMutation<BackupInfo, { destinationPath: string }>("backup_create", {
    onMutate: async () => {
      // Cancel les queries lourdes pour libérer la file IPC pendant le backup.
      // retry: false (cf. main.tsx) garantit qu'elles ne refetch pas en boucle.
      await Promise.all([
        qc.cancelQueries({ queryKey: ["dashboard"] }),
        qc.cancelQueries({ queryKey: ["planning"] }),
        qc.cancelQueries({ queryKey: ["ordres-travail"] }),
        qc.cancelQueries({ queryKey: ["gammes"] }),
        qc.cancelQueries({ queryKey: ["contrats"] }),
        qc.cancelQueries({ queryKey: ["equipements"] }),
        qc.cancelQueries({ queryKey: ["localisations"] }),
      ]);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["get_derniere_sauvegarde"] });
      // Force un refetch des queries lourdes après le backup pour rafraîchir
      // l'état des pages (dashboard et planning surtout)
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["planning"] });
    },
  });
}
```

### 2. Vérifier l'effet sur `useBackupRestore` et `useRestorePreRestore`

Ces deux mutations terminent par `app.restart()` — l'app redémarre, donc TanStack reset son state. Pas besoin de cancel/invalidate pour elles. Confirmer mais ne pas modifier.

### 3. (Optionnel) Documenter dans `.claude/rules/tanstack-query.md`

Ajouter un paragraphe court dans la section « Mutations » pour ce pattern « Mutation longue + pause queries ». Considérer si ça mérite une section ou pas — décision à prendre lors de l'écriture.

## Ordre d'exécution

1. Modifier `useBackupCreate` dans `src/hooks/use-backup.ts`
2. `npx tsc --noEmit`
3. (Optionnel) Étendre la doc tanstack-query

## Critère de validation

- `npx tsc --noEmit` passe sans erreur
- À l'exécution : dans les DevTools Network/Console, pendant un backup, le nombre d'invokes en queue derrière `backup_create` doit être réduit à 0-2 (au lieu de 8-15)
- Après le backup, le Dashboard et le Planning se rafraîchissent automatiquement (effet de `invalidateQueries` dans `onSettled`)
