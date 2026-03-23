---
paths:
  - "src/components/**/*.tsx"
  - "src/pages/**/*.tsx"
---

# Règles shadcn/ui

## Composants UI

- Vérifier le registre shadcn/ui AVANT de créer un composant custom — composer à partir des primitives existantes (Card, Button, Dialog, Sheet, etc.)
- Le dossier `components/ui/` est réservé aux composants shadcn/ui — les composants custom vont dans `components/shared/` ou `components/domain/`
- Utiliser `cn()` (clsx + tailwind-merge) pour tout merge de className — ne jamais concaténer des strings de classes
- Toujours accepter `className` en prop et le merger en dernier : `cn(baseStyles, variants, className)`
- Utiliser les CSS variables du thème (`--primary`, `--background`, etc.) — ne pas hardcoder de couleurs
- Ne jamais supprimer les data-attributes (`data-slot`, `data-state`) des composants shadcn/ui
- Toujours forwarder `ref` avec `React.forwardRef` quand on wrap un composant shadcn/ui

## Formulaires

- Utiliser le pattern shadcn/ui complet : `<FormField>` + `<FormItem>` + `<FormLabel>` + `<FormControl>` + `<FormMessage>`
- Ne jamais câbler manuellement l'affichage des erreurs — `<FormMessage>` le fait automatiquement
- Utiliser `<Form>` (wrapper shadcn/ui de React Hook Form) pour chaque formulaire

## Composants custom à construire

Ces composants n'existent pas dans shadcn/ui et doivent être construits au-dessus :

| Composant | Construction recommandée |
|---|---|
| `DataTable` | `@tanstack/react-table` + Table shadcn/ui |
| `TreeView` | Récursif custom avec Accordion shadcn ou divs |
| `Timeline` | Divs avec bordure verticale |
| `CalendarGrid` | Grid CSS custom |
| `StatCard` | Card shadcn + contenu formaté |
| `DescriptionList` | Éléments `dl`/`dt`/`dd` stylés |
| `CommandPalette` | `cmdk` + CommandDialog shadcn |
| `ImagePicker` | Input file + preview Canvas |
| `DateRangePicker` | 2x Calendar shadcn dans un Popover |
| `SelectSearch` | Popover + Command shadcn (combobox) |

## Variantes custom

Utiliser `cva` (class-variance-authority) pour les variantes :
```ts
const badgeVariants = cva("...", {
  variants: {
    statut: {
      planifie: "bg-blue-100 text-blue-800",
      en_cours: "bg-yellow-100 text-yellow-800",
      cloture: "bg-green-100 text-green-800",
      annule: "bg-gray-100 text-gray-800 line-through",
      reouvert: "bg-orange-100 text-orange-800",
    }
  }
});
```
