# Étape 5 — Permissions centralisées

## Objectif

Centraliser les règles de permission par rôle, aujourd'hui écrites en dur dans
~12 écrans avec un nommage hétérogène (`canManage`/`canEdit`), dans un module de
fonctions pures `lib/permissions.ts` + un hook `usePermissions()`. Le front ne
fait que **refléter** le rôle ; la sécurité reste portée par la RLS — on ne
duplique pas la validation, on évite juste la divergence d'affichage.

## Contexte

Familles de droits repérées :

- **Métier (créer/modifier ressources)** = `admin | manager | technicien`
  (8 écrans, parfois nommé `canManage`, parfois `canEdit`).
- **Administratif** = `admin | manager` (utilisateurs, investissements, prestataires).
- **Admin seul** = `admin` (sites ; et `isAdmin` dans `utilisateur-detail`).
- **Demandes** : `canCreate = role !== 'lecteur'` ; `canResolve = métier`.
- **Hiérarchique** (`utilisateur-detail`) : `canEdit = isAdmin || (manager &&
cible subordonnée)` avec `SUBORDINATE_ROLES = ['technicien','lecteur','demandeur']`.

## Fichier(s) impacté(s)

- `src/lib/permissions.ts` (nouveau)
- `src/hooks/use-permissions.ts` (nouveau)
- `src/routes/_app/` : `chantiers.tsx`, `documents.tsx`, `equipements.tsx`,
  `gammes.tsx`, `localisations.tsx`, `ordres-travail.tsx`, `registre.tsx`,
  `utilisateurs.tsx`, `investissements.tsx`, `prestataires.tsx`, `sites.tsx`,
  `demandes.tsx`
- `src/components/common/documents-tab.tsx`
- `src/features/utilisateurs/components/utilisateur-detail.tsx`

## Travail à réaliser

### 1. `lib/permissions.ts` (fonctions pures)

```ts
const METIER = ['admin', 'manager', 'technicien']
const ADMINISTRATIF = ['admin', 'manager']
const SUBORDINATE_ROLES = ['technicien', 'lecteur', 'demandeur']

type Role = string | null | undefined

export function isAdmin(role: Role): boolean {
  return role === 'admin'
}
export function canManageMetier(role: Role): boolean {
  return !!role && METIER.includes(role)
}
export function canManageAdmin(role: Role): boolean {
  return !!role && ADMINISTRATIF.includes(role)
}
export function canCreateDemande(role: Role): boolean {
  return !!role && role !== 'lecteur'
}
export function canResolveDemande(role: Role): boolean {
  return canManageMetier(role)
}
export function canEditUser(role: Role, targetRole: Role): boolean {
  return (
    isAdmin(role) ||
    (role === 'manager' &&
      !!targetRole &&
      SUBORDINATE_ROLES.includes(targetRole))
  )
}
```

### 2. `hooks/use-permissions.ts`

```ts
import { useCurrentRole } from '@/hooks/use-current-role'
import * as perm from '@/lib/permissions'

export function usePermissions() {
  const { data: role, isPending } = useCurrentRole()
  return {
    role,
    isPending,
    isAdmin: perm.isAdmin(role),
    canManageMetier: perm.canManageMetier(role),
    canManageAdmin: perm.canManageAdmin(role),
    canCreateDemande: perm.canCreateDemande(role),
    canResolveDemande: perm.canResolveDemande(role),
  }
}
```

### 3. Migration des écrans

Remplacer les expressions en dur par les helpers/hook :

- `const canManage = role === 'admin' || role === 'manager' || role === 'technicien'`
  → `canManageMetier` (renommer les `canEdit` métier en `canManageMetier` pour
  lever l'ambiguïté).
- `role === 'admin' || role === 'manager'` → `canManageAdmin`.
- `role === 'admin'` → `isAdmin`.
- `demandes.tsx` : `canCreateDemande` / `canResolveDemande`.
- `utilisateur-detail.tsx` : `canEditUser(role, targetRole)` (la logique
  hiérarchique vit désormais dans `lib/permissions.ts` ; conserver
  `SUBORDINATE_ROLES` côté lib).

Préserver à l'identique les droits par écran (ne pas élargir/réduire un rôle).
Vérifier chaque écran un par un (un écran pourrait autoriser un rôle de plus).

## Critère de validation

- `npx tsc -b`, `npx eslint .`, `npx vite build` passent.
- Plus aucune expression `role === '...'` dispersée dans les écrans (centralisées).
- Les droits affichés sont identiques à avant pour chaque rôle (admin, manager,
  technicien, lecteur, demandeur) — vérifier mentalement écran par écran.
- Cohérence maintenue avec la RLS (mêmes rôles autorisés qu'avant).
