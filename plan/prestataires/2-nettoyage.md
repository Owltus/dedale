# Étape 2 — Nettoyage (suppression pages contrats + sidebar)

## Objectif
Supprimer les pages contrats devenues obsolètes et retirer l'entrée sidebar.

## Fichiers impactés

### Supprimer
- `src/pages/contrats/index.tsx`
- `src/pages/contrats/[id].tsx`
- Le dossier `src/pages/contrats/` entier

### Modifier
- `src/components/layout/Sidebar.tsx` — retirer l'entrée `{ label: "Contrats", path: "/contrats", icon: FileText }`
- `src/router.tsx` — retirer les routes `/contrats` et `/contrats/:id`, retirer les lazy imports

### Conserver
- `src/hooks/use-contrats.ts` — utilisé par la nouvelle page prestataire détail
- `src/lib/types/contrats.ts` — idem
- `src/lib/schemas/contrats.ts` — idem (si existe)
- Backend Rust — aucun changement

## Critère de validation
- `npx tsc --noEmit` passe
- Plus de page `/contrats` accessible
- Sidebar n'affiche plus "Contrats"
- Navigation prestataire → contrats fonctionne dans l'onglet
