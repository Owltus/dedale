# Diagramme de Gantt — Planning par semaine

## Contexte

La page Planning actuelle est basique. L'utilisateur veut un vrai diagramme de Gantt hebdomadaire avec :
- Les OT (planifiés + en cours) comme barres sur une timeline
- Organisation par famille gamme (dépliable → gammes en dessous)
- Navigation semaine par semaine (< >)
- Clic sur un OT → navigation vers la page détail

## Architecture

### Layout
```
┌─ PageHeader "Planning" ──────────────────────────────────┐
│  < Semaine 14 — 31 mars au 6 avril 2026 >   [Aujourd'hui] │
├──────────────────────────────────────────────────────────────┤
│              Lun 31  Mar 01  Mer 02  Jeu 03  Ven 04  ...   │
│ ─────────────────────────────────────────────────────────── │
│ ▼ Sécurité incendie                                         │
│   Extincteurs    ████                                       │
│   BAES hebdo              ████                              │
│   Colonnes sèches                            (vide)         │
│                                                              │
│ ▼ Transport vertical                                         │
│   Ascenseur                      ████████████               │
│                                                              │
│ ► CVC (replié — pas d'OT cette semaine)                     │
└──────────────────────────────────────────────────────────────┘
```

### Données nécessaires (déjà existantes)
- `useOrdresTravail()` → tous les OT avec `date_prevue`, `id_statut_ot`, `nom_gamme`, `id_gamme`
- `useGammes()` → toutes les gammes avec `id_famille_gamme`
- `useFamillesGammes()` → familles gammes avec `id_domaine_gamme`
- `useDomainesGammes()` → domaines gammes

### Logique frontend
1. Filtrer les OT dont `date_prevue` tombe dans la semaine affichée
2. Regrouper par : Domaine gamme → Famille gamme → Gamme → OT
3. Pour chaque OT : positionner la barre sur le jour correspondant
4. Couleurs statut :
   - Planifié (1) → bleu
   - En cours (2) → jaune
   - Clôturé (3) → vert
   - Annulé (4) → gris barré
   - Réouvert (5) → orange
   - En retard (date_prevue < today && statut ∈ {1,2,5}) → rouge

### Interactions
- **Clic barre OT** → `navigate(/ordres-travail/${id})`
- **Clic chevron famille** → expand/collapse les gammes
- **< >** → semaine précédente/suivante
- **Bouton "Aujourd'hui"** → revenir à la semaine courante
- **Hover barre** → tooltip avec nom gamme, statut, prestataire

---

## Aucun changement backend

Toutes les données sont déjà disponibles via les hooks existants. Le Gantt est un composant frontend pur.

---

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/pages/planning/index.tsx` | **Réécrire** complètement |
| `src/components/shared/GanttChart.tsx` | **Nouveau** — composant Gantt réutilisable (optionnel, peut être inline) |
| Backend | Aucun changement |

---

## Implémentation

### Composant GanttChart

Props :
```typescript
interface GanttChartProps {
  weekStart: Date;               // Lundi de la semaine
  ots: OtListItem[];             // OT filtrés pour la semaine
  gammes: GammeListItem[];       // Toutes les gammes
  famillesGammes: FamilleGamme[]; // Familles gammes
  domainesGammes: DomaineGamme[]; // Domaines gammes
  onOtClick: (id: number) => void;
}
```

Structure DOM :
```
<div className="grid" style="grid-template-columns: 200px repeat(7, 1fr)">
  <!-- Header row : vide | Lun | Mar | ... | Dim -->
  <!-- Pour chaque domaine/famille : -->
  <!--   Ligne famille (expandable) -->
  <!--   Lignes gammes (si expanded) avec barres OT -->
</div>
```

### Barre OT
- Position : colonne = jour de la semaine (1-7)
- Largeur : 1 colonne (1 jour, sauf si multi-jours)
- Couleur : selon statut (CSS classes)
- Clic : navigate
- Hover : tooltip

### Navigation semaine
- State `weekStart` (Date, toujours un lundi)
- `< >` : ±7 jours
- "Aujourd'hui" : reset au lundi de la semaine courante
- Affichage : "Semaine N — DD mois au DD mois YYYY"

### Expand/Collapse
- State `expandedFamilies: Set<number>` (id_famille_gamme)
- Par défaut : toutes les familles qui ont des OT cette semaine sont expanded
- Familles sans OT : collapsed avec indicateur "(aucun OT)"
