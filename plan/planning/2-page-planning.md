# Étape 2 — Page Planning

## Objectif
Réécrire la page Planning pour utiliser le composant Gantt.

## Fichier impacté
- `src/pages/planning/index.tsx`

## Travail à réaliser

### Données
```typescript
const { data: ots = [] } = useOrdresTravail();
const { data: gammes = [] } = useGammes();
const { data: familles = [] } = useFamillesGammes();
const { data: domaines = [] } = useDomainesGammes();
```

### State
```typescript
const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
const [expandedFamilies, setExpandedFamilies] = useState<Set<number>>(new Set());
```

### Logique
1. Calculer `weekEnd` = weekStart + 6 jours
2. Filtrer les OT : `date_prevue >= weekStart && date_prevue <= weekEnd`
3. Pour chaque OT filtré, résoudre sa gamme → sa famille
4. Construire les `GanttRow[]` :
   - Pour chaque famille qui a au moins 1 OT : ligne "famille" + lignes "gamme"
   - Pour chaque famille sans OT : ligne "famille" collapsed
5. Auto-expand les familles avec OT

### Navigation
```typescript
const prevWeek = () => setWeekStart(d => addDays(d, -7));
const nextWeek = () => setWeekStart(d => addDays(d, 7));
const goToday = () => setWeekStart(getMonday(new Date()));
```

### Header
```
PageHeader "Planning"
  < [Semaine 14 — 31 mars au 6 avril 2026] > [Aujourd'hui]
```
Les boutons < > et Aujourd'hui dans le PageHeader, avec Tooltip.

### Layout
```
<div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
  <PageHeader .../>
  <GanttChart ... className="flex-1 overflow-auto"/>
</div>
```

## Critère de validation
- `npx tsc --noEmit` passe
- Le Gantt affiche les OT de la semaine courante
- Navigation < > fonctionne
- Clic sur un OT → page détail
