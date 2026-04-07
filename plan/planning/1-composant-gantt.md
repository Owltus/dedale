# Étape 1 — Composant Gantt

## Objectif
Créer le composant de rendu du diagramme de Gantt (grille, barres OT, expand/collapse).

## Fichier à créer
- `src/components/shared/GanttChart.tsx`

## Structure

### Props
```typescript
interface GanttRow {
  type: "famille" | "gamme";
  id: number;
  label: string;
  familleId?: number;  // pour les gammes
  ots: Array<{
    id: number;
    day: number;        // 0-6 (lundi-dimanche)
    statut: number;
    nom: string;
    prestataire: string | null;
    enRetard: boolean;
  }>;
}

interface GanttChartProps {
  weekStart: Date;
  rows: GanttRow[];
  expandedFamilies: Set<number>;
  onToggleFamily: (id: number) => void;
  onOtClick: (id: number) => void;
}
```

### Rendu
- Grid CSS : `grid-template-columns: 200px repeat(7, 1fr)`
- Header : 7 colonnes avec jour + date (Lun 31, Mar 01, etc.)
- Ligne famille : fond légèrement coloré, chevron expand/collapse, compteur OT
- Ligne gamme : nom + barres OT positionnées sur les jours
- Barre OT : arrondie, couleur statut, cliquable, tooltip au hover
- Ligne "aujourd'hui" : colonne surlignée avec un fond subtil

### Couleurs barres
```
Planifié (1)  → bg-blue-500
En cours (2)  → bg-yellow-500
Clôturé (3)   → bg-green-500
Annulé (4)    → bg-muted line-through
Réouvert (5)  → bg-orange-500
En retard     → bg-destructive
```

### Tooltip hover
```
Nom gamme
Statut : En cours
Prestataire : Okko Hotels
```

## Critère de validation
- Le composant se rend sans erreur
- Les barres sont positionnées sur les bons jours
- Expand/collapse fonctionne
