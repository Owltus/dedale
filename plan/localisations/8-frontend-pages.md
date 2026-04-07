# Étape 8 — Frontend pages

## Objectif
Réécrire la page localisations + créer 2 nouvelles pages + mettre à jour les selects dans gammes/équipements.

## Fichiers impactés

### Réécrire
- `src/pages/localisations/index.tsx` → liste des bâtiments (pattern Niveau 1)

### Créer
- `src/pages/localisations/batiments/[idBatiment].tsx` → niveaux d'un bâtiment (pattern Niveau 2)
- `src/pages/localisations/niveaux/[idNiveau].tsx` → locaux d'un niveau (pattern Niveau 2)

### Modifier
- `src/pages/gammes/[id].tsx` → select localisation utilise `useLocalisationsTree()` avec `id_local`
- `src/pages/gammes/familles/[idFamille].tsx` → idem
- `src/pages/equipements/familles/[idFamille].tsx` → idem

### Supprimer
- Le composant `TreeView` n'est plus utilisé par la page localisations (vérifier s'il est utilisé ailleurs)

## Pattern des pages

### `localisations/index.tsx` — Liste bâtiments
```
PageHeader "Localisations" + bouton [+] Tooltip
Table inline : Nom | Description | Actions (edit/delete)
Empty state Inbox
Dialog create/edit bâtiment (useForm + zodResolver)
ConfirmDialog delete
```

### `localisations/batiments/[idBatiment].tsx` — Niveaux du bâtiment
```
Breadcrumb : Localisations > [Bâtiment]
PageHeader [Bâtiment] + boutons [+] [✏️] [🗑️] Tooltip
Table inline : Nom | Description | Actions
Empty state
Dialog create/edit niveau
ConfirmDialog delete bâtiment
```

### `localisations/niveaux/[idNiveau].tsx` — Locaux du niveau
```
Breadcrumb : Localisations > [Bâtiment] > [Niveau]
PageHeader [Niveau] + boutons [+] [✏️] [🗑️] Tooltip
Table inline : Nom | Description | Actions
Empty state
Dialog create/edit local
ConfirmDialog delete niveau
```

## Selects localisation dans gammes/équipements
Le dropdown actuel utilise `useLocalisationsTree()` qui retourne des `LocalisationNode` avec `depth`.
Le nouveau `useLocalisationsTree()` retourne des `LocalisationTreeNode` avec `label` = "Bât A > RDC > Cuisine".

```tsx
<select value={form.watch("id_local") ?? ""} onChange={...}>
  <option value="">— Aucun —</option>
  {locNodes.map((n) => (
    <option key={n.id_local} value={n.id_local}>{n.label}</option>
  ))}
</select>
```

## Router
Ajouter les nouvelles routes dans `src/router.tsx` :
```tsx
{ path: "localisations/batiments/:idBatiment", element: <BatimentDetail /> },
{ path: "localisations/niveaux/:idNiveau", element: <NiveauDetail /> },
```

## Critère de validation
- `npx tsc --noEmit` passe
- Navigation Bâtiments → Niveaux → Locaux fonctionne
- Select localisation dans gammes/équipements fonctionne
