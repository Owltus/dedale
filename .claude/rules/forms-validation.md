---
paths:
  - "src/lib/schemas/**/*.ts"
  - "src/pages/**/*.tsx"
  - "src/components/**/*.tsx"
---

# Règles React Hook Form + Zod

## Schemas Zod

- Le schema Zod est la **source de vérité unique** pour les types — dériver avec `z.infer<typeof schema>`, ne jamais dupliquer
- Les schemas Zod doivent **miroir les CHECK contraintes SQL** du `schema.sql`
- Utiliser `z.coerce.number()` pour les inputs numériques — les inputs HTML retournent toujours des strings
- Utiliser `.refine()` ou `.superRefine()` pour les validations cross-champs (ex: `seuil_min <= seuil_max`, `date_fin >= date_debut`)
- Pour les champs optionnels qui peuvent être vides : `z.string().optional().or(z.literal('')).transform(v => v || undefined)`
- 1 fichier par domaine dans `src/lib/schemas/`

## Validations à miroir depuis le schema SQL

| Contrainte SQL | Schema Zod |
|---|---|
| `NOT NULL` + `TEXT` | `z.string().trim().min(1)` |
| `CHECK (LENGTH(TRIM(x)) > 0)` | `z.string().trim().min(1)` |
| `CHECK (code_postal GLOB '[0-9]{5}')` | `z.string().regex(/^\d{5}$/)` |
| `CHECK (email LIKE '%_@_%.__%')` | `z.string().email()` |
| `CHECK (x > 0)` | `z.number().positive()` |
| `CHECK (x IN (0, 1))` | `z.boolean()` ou `z.number().min(0).max(1)` |
| `CHECK (a <= b)` | `.refine(d => d.a <= d.b)` |
| `CHECK (necessite_seuils AND id_unite)` | `.refine()` conditionnel |

## React Hook Form

- Toujours utiliser `zodResolver(schema)` dans `useForm({ resolver: zodResolver(schema) })`
- Toujours fournir `defaultValues` pour TOUT le formulaire — ne pas utiliser `defaultValue` sur les inputs individuels
- Utiliser `useWatch({ name: 'champ' })` au lieu de `watch()` pour les souscriptions par champ — évite les re-renders inutiles
- Utiliser `FormProvider` + `useFormContext` uniquement pour les formulaires profonds (3+ niveaux de nesting)
- Appeler `reset()` dans `useEffect` ou callback `onSuccess`, jamais avant le mount
- Ne jamais utiliser `useState` pour gérer les valeurs d'un formulaire — React Hook Form gère tout

## Champs conditionnels

Pattern pour les champs qui apparaissent/disparaissent selon une condition :

```tsx
const typeOp = useWatch({ control, name: "id_type_operation" });
const necessiteSeuils = typesOperations.find(t => t.id === typeOp)?.necessite_seuils;

{necessiteSeuils && (
  <>
    <FormField name="id_unite" ... />   {/* obligatoire si mesure */}
    <FormField name="seuil_minimum" ... />
    <FormField name="seuil_maximum" ... />
  </>
)}
```

Quand un champ conditionnel est masqué, utiliser `setValue('champ', undefined)` pour nettoyer la valeur.
