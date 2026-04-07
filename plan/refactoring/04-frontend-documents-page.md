# Phase 4 — Refactorer documents/index.tsx

## Contexte

Le fichier `src/pages/documents/index.tsx` fait **452 lignes** avec :
- **12 useState** pour gérer 3 modals (upload, edit, preview)
- Formulaire d'édition en useState au lieu de React Hook Form
- 3 Dialog custom au lieu de `CrudDialog`
- 1 `invoke()` direct (ligne 153) sans TanStack Query

## Architecture cible

```
src/pages/documents/
├── index.tsx              ← ~120 lignes (liste + orchestration modals)
├── UploadModal.tsx         ← Dialog upload unifié (drop zone + fichiers pending)
├── DocumentEditModal.tsx   ← CrudDialog édition (RHF + Zod)
└── DocumentPreviewModal.tsx ← Dialog preview (image/PDF)
```

## Ordre d'exécution

### 4.1 Créer le schema Zod pour l'édition document

Fichier : `src/lib/schemas/documents.ts` (nouveau)

```typescript
export const documentEditSchema = z.object({
  nom_original: z.string().trim().min(1),
  id_type_document: z.coerce.number().int(),
});
```

### 4.2 Créer `DocumentEditModal.tsx`

- Utiliser `CrudDialog` (pas Dialog brut)
- Utiliser `useForm({ resolver: zodResolver(documentEditSchema) })`
- Props : `doc: DocumentListItem | null`, `onOpenChange`, `onSubmit`
- Inclure le champ "Remplacer fichier" (input file optionnel)
- Remplace les useState `editDoc`, `editName`, `editType`, `replaceFile`

### 4.3 Créer `DocumentPreviewModal.tsx`

- Dialog simple pour afficher image (base64 → img) ou PDF (iframe/embed)
- Props : `doc: DocumentListItem | null`, `data: string | null`, `onClose`
- Remplace les useState `previewDoc`, `previewData`

### 4.4 Extraire `UploadModal.tsx`

- Contient toute la logique d'upload : fichiers pending, type global, drag&drop modal
- Gère en interne : `pendingFiles`, `globalType`, `modalDragging`, `fileInputRef`, `dropZoneRef`, `pendingIdRef`
- Props : `open`, `onOpenChange`, `typesDoc`, `onUpload(files)`
- Inclut le listener Tauri `onDragDropEvent` (avec le pattern `dropHandlerRef`)

### 4.5 Créer hook `useReadFileBase64`

Fichier : `src/hooks/use-documents.ts` (ajouter)

Encapsuler l'`invoke("read_file_base64")` dans un `useMutation` pour respecter le pattern TanStack Query :
```typescript
export function useReadFileBase64() {
  return useInvokeMutation<string, { path: string }>("read_file_base64");
}
```

### 4.6 Simplifier `index.tsx`

- Garder : `PageHeader` + `CardList` + `DropZone` + orchestration des 3 modals
- Chaque modal = 1 composant avec ses propres useState internes
- Résultat attendu : ~120 lignes

## Fichiers impactés

| Couche | Fichiers | Action |
|--------|----------|--------|
| Schemas | `src/lib/schemas/documents.ts` | Nouveau |
| Hooks | `src/hooks/use-documents.ts` | Ajouter `useReadFileBase64` |
| Pages | `src/pages/documents/index.tsx` | Réduire de 452 → ~120 lignes |
| Pages | `src/pages/documents/UploadModal.tsx` | Nouveau (~180 lignes) |
| Pages | `src/pages/documents/DocumentEditModal.tsx` | Nouveau (~60 lignes) |
| Pages | `src/pages/documents/DocumentPreviewModal.tsx` | Nouveau (~40 lignes) |
| **Total** | **6 fichiers** | 4 nouveaux, 2 modifiés |

## Vérification

1. **Compilation** : `npx tsc --noEmit` sans erreur
2. **Test upload** : bouton + drag&drop → fichiers arrivent dans le modal → upload fonctionne
3. **Test édition** : renommer, changer type, remplacer fichier → sauvegarde OK
4. **Test preview** : clic sur image → aperçu, clic sur PDF → aperçu
5. **Test suppression** : confirmation → document supprimé
6. **Test navigation** : upload en cours → changer de page → toast persiste (UploadQueue global)
