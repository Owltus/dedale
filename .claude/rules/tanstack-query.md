---
paths:
  - "src/hooks/**/*.ts"
  - "src/pages/**/*.tsx"
---

# Règles TanStack Query

## Query Keys

- Structurer les clés comme des tableaux hiérarchiques : `['entité', 'action', { filtres }]`
- Créer une factory de clés par domaine dans un fichier dédié :
  ```ts
  export const otKeys = {
    all: ['ordres-travail'] as const,
    lists: () => [...otKeys.all, 'list'] as const,
    list: (filtres: OtFiltres) => [...otKeys.lists(), filtres] as const,
    details: () => [...otKeys.all, 'detail'] as const,
    detail: (id: number) => [...otKeys.details(), id] as const,
  };
  ```
- Inclure TOUTES les variables utilisées par la queryFn dans la clé — comme un tableau de dépendances

## Queries

- Encapsuler chaque `useQuery` dans un hook custom nommé — ne jamais appeler `useQuery` directement dans un composant
- Utiliser `enabled: !!dependency` pour les queries qui dépendent d'une valeur pas encore disponible
- Définir `staleTime` approprié — les données de référence (statuts, types) peuvent avoir `staleTime: Infinity`
- Utiliser `select` pour transformer/filtrer les données — garder la réponse complète dans le cache
- Utiliser `placeholderData` (pas `initialData`) pour afficher des données périmées sans polluer le cache

## Mutations

- Encapsuler chaque `useMutation` dans un hook custom nommé
- Pattern optimistic update complet :
  1. `onMutate` : `cancelQueries` → sauvegarder `previous` → `setQueryData` optimiste → retourner `{ previous }`
  2. `onError` : restaurer `previous` depuis le context → toast d'erreur
  3. `onSettled` : `invalidateQueries` (pas dans `onSuccess` — `onSettled` couvre succès ET erreur)
- Toujours invalider les queries liées dans `onSettled` :
  - Après mutation OT → invalider `otKeys.all`, `dashboardKeys.all`
  - Après mutation gamme → invalider `gammeKeys.all`, `otKeys.all` (propagation)
- Mettre à jour le cache immutablement avec `setQueryData` — ne jamais muter l'objet en cache

## Gestion d'erreurs

- Les erreurs des commandes Tauri sont des `String` — les afficher dans un toast destructive
- Distinguer erreurs trigger (messages métier en français) des erreurs système (stack traces) — ne montrer que le message métier à l'utilisateur
