# Étape 4 — Garde « site » factorisée

## Objectif

Factoriser la garde « aucun site actif → écran d'invitation à sélectionner un
site », recopiée à l'identique sur 12 pages, dans un composant
`common/no-site-selected.tsx` paramétrable.

## Contexte

Le motif est partout : `if (!activeSiteId) return (<PageContainer><PageHeader
.../><EmptyState icon=... title="Sélectionne un site" description=.../></PageContainer>)`.
Seuls l'icône, le titre et la description changent. La source est toujours
`useSiteContext().activeSiteId`.

Le cas `components/common/documents-tab.tsx` est différent (EmptyState seul, dans
une fiche, pas de PageHeader) — il reste avec sa garde locale, hors périmètre.

## Fichier(s) impacté(s)

- `src/components/common/no-site-selected.tsx` (nouveau)
- `src/routes/_app/chantiers.tsx`, `demandes.tsx`, `documents.tsx`,
  `equipements.tsx`, `gammes.tsx`, `investissements.tsx`, `localisations.tsx`,
  `ordres-travail.tsx`, `planning.tsx`, `prestataires.tsx`, `registre.tsx`,
  `releves.tsx`

## Travail à réaliser

### 1. Composant

```tsx
import type { LucideIcon } from 'lucide-react'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'

export function NoSiteSelected({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: LucideIcon
}) {
  return (
    <PageContainer>
      <PageHeader title={title} />
      <EmptyState
        icon={icon}
        title="Sélectionne un site"
        description={description}
      />
    </PageContainer>
  )
}
```

Vérifier l'API réelle de `PageHeader` et `EmptyState` (props `title`,
`description`, `icon`) et s'y conformer. Conserver le `title` de PageHeader de
chaque page (ex. « Ordres de travail »).

### 2. Migration des pages

Remplacer chaque bloc de garde par :

```tsx
if (!activeSiteId) {
  return (
    <NoSiteSelected
      title="Ordres de travail"
      description="Choisis un site pour voir ses ordres de travail."
      icon={ClipboardList}
    />
  )
}
```

Reprendre le `title`/`description`/`icon` existants de chaque page (ne pas
homogénéiser les textes métier ni les icônes — juste factoriser la structure).
Retirer les imports devenus inutiles (PageHeader/EmptyState/PageContainer) si la
page ne les utilise plus ailleurs.

## Critère de validation

- `npx tsc -b`, `npx eslint .`, `npx vite build` passent.
- Les 12 pages utilisent `NoSiteSelected` ; le rendu de l'écran « pas de site »
  est identique (mêmes titres, descriptions, icônes).
- `documents-tab` inchangé.
