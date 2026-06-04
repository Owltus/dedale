# Conventions — Composants réutilisables

> Lue quand on crée un composant, un modal, ou qu'on se demande « où mettre ça ».

## Où mettre quoi

| Type                          | Emplacement                          | Exemple                                                |
| ----------------------------- | ------------------------------------ | ------------------------------------------------------ |
| Générique, zéro métier        | `src/components/ui/`                 | `button`, `card`, `dialog` (shadcn)                    |
| Transverse maison, non métier | `src/components/common/`             | `EmptyState`, `ErrorState`, `ModeToggle`, `PageHeader` |
| Métier                        | `src/features/<domaine>/components/` | `EquipementCard`, `OtTable`                            |

Règle : si tu assembles les mêmes `ui/` de la même façon ≥ 2 fois → remonte un composant dans `common/`.

## Écrire un composant `ui`/`common`

- Signature : `function X({ className, ...props }: ComponentProps<'div'> & { ... })`.
- Toujours `className={cn('classes-de-base', className)}` pour permettre l'override.
- Variantes → **CVA** (cf. `button.tsx`, `badge.tsx`), types dérivés via `VariantProps<typeof xVariants>`.
- React 19 : pas de `forwardRef` (on prend `ComponentProps`), attribut `data-slot` pour le ciblage CSS.

## Modals (stratégie « simple d'abord »)

Base = `Dialog` shadcn (`src/components/ui/dialog.tsx`) → accessibilité gérée (focus trap, Esc, aria). État d'ouverture local :

```tsx
const [open, setOpen] = useState(false)
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Titre</DialogTitle>            {/* TOUJOURS un titre (sinon warning a11y) */}
      <DialogDescription>…</DialogDescription>
    </DialogHeader>
    {/* contenu / formulaire */}
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
      <Button onClick={…}>Valider</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- **Un seul modal visible à la fois** ; ne pas empiler.
- Modal métier d'édition → composant dédié `features/<domaine>/components/<Entité>Dialog.tsx`.
- Si le volume de modals devient ingérable ou qu'on veut des vues **partageables par lien**, on réévaluera (gestionnaire global type nice-modal, ou pilotage par l'URL). Pour l'instant : state local + composant dédié.

## À NE PAS FAIRE

- ❌ Réécrire l'accessibilité d'un modal à la main ; `DialogContent` sans `DialogTitle`.
- ❌ Mettre de la logique métier dans `components/ui`.
- ❌ Concaténer des classes conditionnelles à la main au lieu de CVA pour les variantes.
- ❌ Modifier lourdement un composant `ui` shadcn sans raison (préférer wrapper dans `common/`).
