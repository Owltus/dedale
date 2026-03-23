---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Règles React + TypeScript

## Composants

- Utiliser `interface` pour les props, pas `type` — les interfaces sont extensibles et produisent de meilleurs messages d'erreur
- Named exports partout — `export function MonComposant()`, pas `export default`
- Un composant < 150 lignes — au-delà, extraire en sous-composants ou hooks custom
- Ne jamais définir un composant à l'intérieur d'un autre composant — ça recrée l'identité à chaque render
- Déplacer les constantes, helpers et données statiques hors du corps du composant
- Utiliser `ReactNode` pour le type `children`, pas `JSX.Element`

## TypeScript

- Ne jamais utiliser `any` — utiliser `unknown` puis narrower avec des type guards
- Laisser TypeScript inférer quand c'est évident — ne pas annoter `useState("hello")`
- Annoter quand la valeur initiale est `null` : `useState<User | null>(null)`
- Dériver les types avec `z.infer<typeof schema>` depuis les schemas Zod — ne jamais dupliquer un type
- Utiliser `Record<string, unknown>` au lieu de `object`
- Typer les event handlers : `React.ChangeEvent<HTMLInputElement>`, pas `any`

## Hooks

- Encapsuler chaque appel `useQuery` / `useMutation` dans un hook custom — `useTodos()`, `useCreateTodo()`
- Ne jamais appeler `invoke()` directement dans un composant — toujours via TanStack Query
- `useCallback` seulement si le callback est passé à un composant mémorisé — ne pas optimiser prématurément
- `useMemo` seulement pour les calculs coûteux mesurés — pas pour les objets simples

## Fichiers

- `src/lib/types/` — 1 fichier par domaine, noms identiques aux structs Rust
- `src/lib/schemas/` — 1 fichier par domaine, schemas Zod comme source de vérité
- `src/pages/{domaine}/` — 1 dossier par domaine métier
- `src/hooks/` — hooks partagés (useInvoke, useSystemNotifications)
- `src/components/shared/` — composants réutilisables inter-domaines
- `src/components/ui/` — **NE PAS MODIFIER** (généré par shadcn CLI)

## Patterns

- Toujours utiliser React Router `<Link>` pour la navigation, jamais `window.location`
- Toujours passer par `useNavigate()` pour la navigation programmatique
- Les formulaires utilisent React Hook Form + Zod — jamais de `useState` pour les champs de formulaire
- Les DataTables utilisent `@tanstack/react-table` — jamais de `<table>` brut
