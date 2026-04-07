# BORG-2026-03-23-003 — Phase 2 Frontend Foundation

> Projet : GMAO Desktop — Tauri v2 + React 19 + TypeScript 6
> Drones deployes : Trois-de-Cinq, Sept-de-Neuf, Deux-de-Cinq, Quatre-de-Cinq, Six-de-Neuf
> Mode : DIAGNOSTIC + EXECUTION (corrections preventives)

## Contexte

Audit du code Phase 2 : layout, router (21 routes lazy), hooks (useInvoke), 10 composants partages, types stubs, utilitaires. ~1500 LOC, 55 fichiers.

## Rapports des drones

### Trois-de-Cinq (Cartographe)
- 82 fichiers scannes, ~3889 LOC total (incluant shadcn/ui)
- 5 fichiers > 100 LOC (max DataTable 167)
- 0 dependances circulaires
- Couplages maitrises, structure barrel-based
- Risque : ROUTE_LABELS ↔ Sidebar sync manuelle

### Sept-de-Neuf (Conformite)
- 30/30 regles verifiees : 100% conforme
- Six-de-Neuf conteste le 100% (Breadcrumb fallback)
- Taux reel apres contradiction : ~97% (pas de violation formelle)

### Deux-de-Cinq (Resilience)
- 9 fragilites rapportees (3 CRITIQUES, 2 MODEREES, 4 LEGERES)
- Six-de-Neuf invalide 6/9 comme faux positifs ou prematures
- Confirmees : SearchInput debounce, ErrorBoundary, retry: false

### Quatre-de-Cinq (Failles)
- 7 failles rapportees (1 CRITIQUE, 1 HAUTE, 1 MOYENNE, 4 BASSES)
- Rejets auto-steelman : useParams, debounce closure, DatePicker, CSP
- Confirmees : ErrorBoundary, retry: false, PopoverTrigger className

### Six-de-Neuf (Contradicteur)
- 6 faux positifs elimines sur 9 fragilites
- 4 faux positifs elimines sur 7 failles
- Angles morts : queryKey ordering, SearchInput+DataTable interaction
- Verdict : code robuste pour scaffold, ~88/100

## Verdict unifie

CRITIQUES : 0 (ErrorBoundary downgrade a MOYENNE — pages stubs ne throw pas)
MOYENNES : 2 (ErrorBoundary absente → CORRIGEE, SearchInput debounce → CORRIGE)
BASSES : 1 (retry: false global — acceptable desktop local)
FAUX POSITIFS ELIMINES : 10

## Actions executees

1. ErrorBoundary.tsx cree dans src/components/layout/
   - Composant classe React, capture erreurs synchrones
   - Affiche message + bouton Reessayer
   - Integre dans RootLayout autour de Suspense

2. SearchInput.tsx corrige
   - onChange retire des deps useEffect
   - Utilise useRef(onChange) pour callback stable
   - Debounce ne se reinitialise plus sur re-render parent

3. Barrel index.ts mis a jour (export ErrorBoundary)

4. npx tsc --noEmit : OK
