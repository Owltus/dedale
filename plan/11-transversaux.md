# Phase 11 — Fonctions transversales

## Objectif
Recherche globale (Ctrl+K), export/impression (PDF, CSV), notifications système centralisées.

## Dépend de
Phase 10 (toutes les entités doivent exister)

## Étapes

### 11.1 Recherche globale (Ctrl+K)

**Backend** : `src-tauri/src/commands/recherche.rs`

```
recherche_globale(query: String, limit: i32) → Vec<SearchResult>

struct SearchResult {
    entity_type: String,   // "OT", "Gamme", "Prestataire", etc.
    entity_id: i64,
    label: String,         // nom principal
    sublabel: String,      // contexte (famille, localisation, etc.)
    route: String,         // "/ordres-travail/42"
}
```

**SQL** : recherche LIKE sur plusieurs tables en parallèle :
```sql
SELECT 'OT' as type, id_ordre_travail as id, nom_gamme as label,
       nom_localisation as sublabel
FROM ordres_travail WHERE nom_gamme LIKE '%' || ?1 || '%'
UNION ALL
SELECT 'Gamme', id_gamme, nom_gamme, (SELECT nom_famille FROM ...)
FROM gammes WHERE nom_gamme LIKE '%' || ?1 || '%'
UNION ALL
SELECT 'Prestataire', id_prestataire, libelle, ville
FROM prestataires WHERE libelle LIKE '%' || ?1 || '%'
-- ... etc pour chaque entité
LIMIT ?2;
```

**Frontend** : `src/components/shared/CommandPalette.tsx`

Utilise la lib `cmdk` + Dialog shadcn :
```tsx
<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="Rechercher partout..." />
  <CommandList>
    <CommandGroup heading="Résultats">
      {results.map(r => (
        <CommandItem onSelect={() => navigate(r.route)}>
          <Badge>{r.entity_type}</Badge>
          <span>{r.label}</span>
          <span className="text-muted-foreground">{r.sublabel}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  </CommandList>
</CommandDialog>
```

Raccourci clavier : `Ctrl+K` / `Cmd+K` enregistré dans le layout racine.

### 11.2 Export PDF

**Backend** : `src-tauri/src/commands/export.rs`

Options :
- **Option A** : génération HTML → impression via `window.print()` (simple, pas de dépendance)
- **Option B** : lib Rust de génération PDF (ex: `printpdf`, `genpdf`)

Recommandation : **Option A** — créer une route `/print/:type/:id` qui affiche une page HTML formatée pour l'impression, puis `window.print()`.

```
// Commandes pour les données d'export
get_export_ot(id)                → OtExportData       (fiche OT imprimable)
get_export_rapport_conformite()  → ConformiteExport    (gammes régl. + derniers OT)
get_export_rapport_activite(mois, annee) → ActiviteExport (synthèse mensuelle)
```

**Frontend** :
```
src/pages/print/
├── PrintOt.tsx                 # Fiche d'intervention imprimable
├── PrintRapportConformite.tsx  # Rapport commission de sécurité
└── PrintRapportActivite.tsx    # Synthèse mensuelle
```

Ces pages ont un layout minimal (pas de sidebar) et appellent `window.print()` au chargement.

### 11.3 Export CSV

**Backend** :
```
export_csv_ot(filtres?)          → String  (contenu CSV)
export_csv_equipements(filtres?) → String
export_csv_gammes(filtres?)      → String
```

**Frontend** : le CSV est retourné comme string, converti en Blob, et téléchargé via un lien `<a download>`.

### 11.4 Notifications système centralisées

**Fichier** : `src/hooks/useSystemNotifications.ts`

Hook qui centralise la détection des effets système après chaque mutation :

```ts
function useSystemNotifications() {
  // Après chaque mutation OT/opération, vérifier les effets retournés par le backend
  // et afficher les toasts appropriés

  function handleEffets(effets: EffetSysteme[]) {
    for (const effet of effets) {
      switch (effet.type) {
        case "auto_cloture":
          toast.info("OT clôturé automatiquement");
          break;
        case "reprogrammation":
          toast.info(`OT #${effet.id} créé, prévu le ${effet.date}`);
          break;
        case "bascule_prestataire":
          toast.warning(`Prestataire basculé sur Mon Entreprise`);
          break;
        case "cascade_annulation":
          toast.info(`${effet.count} opération(s) annulée(s)`);
          break;
        case "propagation":
          toast.info(`${effet.count} OT actif(s) mis à jour`);
          break;
      }
    }
  }

  return { handleEffets };
}
```

### 11.5 Boutons d'export dans les pages

Ajouter un `<DropdownMenu>` "Exporter" dans le `<PageHeader>` des pages :
- Liste OT → CSV, PDF rapport activité
- Détail OT → PDF fiche d'intervention
- Liste gammes → CSV
- Liste équipements → CSV
- Paramètres → PDF rapport conformité

## Critère de validation
- `Ctrl+K` ouvre la palette, tape "chaud" → trouve "Chaudière" (équipement), "Vérification chaudière" (gamme)
- Export PDF fiche OT → ouvre la fenêtre d'impression du navigateur
- Export CSV liste OT → télécharge un fichier .csv
- Rapport conformité → liste toutes les gammes réglementaires avec statut
- Les toasts système s'affichent correctement après les mutations
