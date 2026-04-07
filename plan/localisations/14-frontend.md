# Étape 14 — Frontend

## Objectif
Supprimer le select localisation des formulaires gammes, afficher la localisation calculée.

## Fichiers impactés
- `src/lib/types/gammes.ts`
- `src/lib/schemas/gammes.ts`
- `src/hooks/use-gammes.ts`
- `src/pages/gammes/[id].tsx`
- `src/pages/gammes/familles/[idFamille].tsx`

## Travail à réaliser

### types/gammes.ts
- Supprimer `id_local: number | null`
- Ajouter :
  ```typescript
  id_batiment_calc: number | null;
  id_niveau_calc: number | null;
  id_local_calc: number | null;
  nom_localisation_calc: string | null;
  ```

### schemas/gammes.ts
- Supprimer `id_local` du gammeSchema

### pages/gammes/[id].tsx
- Supprimer `useLocalisationsTree()` (plus besoin du dropdown)
- Supprimer le state `editLocalisation` et le `<select>` localisation dans le formulaire d'édition
- Supprimer `id_local` des defaultValues et de la soumission
- Afficher `gamme.nom_localisation_calc` dans le InfoItem "Localisation" (lecture seule, pas éditable)
- Invalider la query gamme après link/unlink équipement (pour refresh du calc)

### pages/gammes/familles/[idFamille].tsx
- Supprimer `useLocalisationsTree()` import
- Supprimer le `<select>` localisation dans le formulaire de création gamme
- Supprimer `id_local` des defaultValues

### pages/equipements/familles/[idFamille].tsx
- `useLocalisationsTree()` reste (les équipements ont toujours `id_local`)
- Inchangé

## Critère de validation
- `npx tsc --noEmit` passe
- Le select localisation a disparu des formulaires gammes
- La localisation calculée s'affiche dans la fiche gamme
- Lier/délier un équipement met à jour la localisation affichée
