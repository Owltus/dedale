# Phase 9 — Système documentaire

## Objectif
Upload de fichiers, liaison à 6 entités (prestataires, OT, gammes, contrats, DI, localisations), composant réutilisable `<DocumentsLies />`, nettoyage automatique des orphelins.

## Dépend de
Phases 5, 6, 7, 8 (toutes les entités auxquelles on peut lier des documents)

## Tables concernées
- `documents` (fichier uploadé avec hash SHA-256)
- `types_documents`
- `documents_prestataires`
- `documents_ordres_travail`
- `documents_gammes`
- `documents_contrats`
- `documents_di`
- `documents_localisations`

## Étapes

### 9.1 Backend

**Fichier** : `src-tauri/src/commands/documents.rs`

```
// Upload (le fichier est lu via Tauri file dialog, pas un formulaire web)
upload_document(nom_original, data: Vec<u8>, id_type_document) → Document
    // Calcul SHA-256, stockage du fichier dans un répertoire dédié
    // Le hash est UNIQUE — doublon rejeté

// Téléchargement
download_document(id_document, destination_path) → ()
    // Copie le fichier vers le chemin choisi par l'utilisateur

// Liste globale
get_documents(filtres?)           → Vec<DocumentListItem>  (avec nb_liaisons)

// Liaisons (1 commande par entité)
link_document_prestataire(id_document, id_prestataire, commentaire?) → ()
link_document_ot(id_document, id_ordre_travail, commentaire?)        → ()
link_document_gamme(id_document, id_gamme, commentaire?)              → ()
link_document_contrat(id_document, id_contrat, commentaire?)          → ()
link_document_di(id_document, id_di, commentaire?)                    → ()
link_document_localisation(id_document, id_localisation, commentaire?) → ()

// Dissociation
unlink_document_prestataire(id_document, id_prestataire) → ()
unlink_document_ot(id_document, id_ordre_travail)        → ()
unlink_document_gamme(id_document, id_gamme)              → ()
unlink_document_contrat(id_document, id_contrat)          → ()
unlink_document_di(id_document, id_di)                    → ()
unlink_document_localisation(id_document, id_localisation) → ()

// Documents liés à une entité
get_documents_for_entity(entity_type: String, entity_id: i64) → Vec<DocumentLie>

// Suppression (si aucune liaison restante — géré par triggers orphelins)
delete_document(id_document) → ()
```

### 9.2 Stockage fichiers

Les fichiers sont stockés dans un sous-répertoire de `app_data_dir()` :
```
{app_data_dir}/documents/{hash_sha256_prefix}/{hash_sha256}.{extension}
```

Le nom original et le type sont en base. Le fichier physique est identifié par son hash.

### 9.3 Frontend — Page documents

**Fichier** : `src/pages/documents/Documents.tsx`

Liste globale de tous les documents avec filtres (type, recherche nom).

### 9.4 Frontend — Composant réutilisable

**Fichier** : `src/components/shared/DocumentsLies.tsx`

Ce composant est utilisé dans 6 pages différentes (prestataires, OT, gammes, contrats, DI, localisations). Props :

```tsx
interface DocumentsLiesProps {
  entityType: "prestataires" | "ordres_travail" | "gammes" | "contrats" | "di" | "localisations";
  entityId: number;
  readonly?: boolean;  // true si entité terminale (OT clôturé, contrat archivé, etc.)
}
```

### 9.5 Frontend — Upload

**Fichier** : `src/components/shared/UploadDialog.tsx`

Utilise `@tauri-apps/plugin-dialog` pour le sélecteur de fichier natif :
```ts
import { open } from '@tauri-apps/plugin-dialog';
const selected = await open({ multiple: false });
```

Puis lecture du fichier via `@tauri-apps/plugin-fs` et envoi au backend.

## Triggers actifs
- 6 triggers `nettoyage_document_orphelin_*` : quand la dernière liaison est supprimée, le document est automatiquement supprimé de la base

## Critère de validation
- Upload d'un fichier via le dialog natif
- Le hash SHA-256 détecte les doublons
- Liaison à chaque type d'entité
- Dissociation fonctionne
- Le composant `DocumentsLies` fonctionne dans les 6 pages
- Téléchargement du fichier vers un emplacement choisi
- Suppression automatique des orphelins (dissocier la dernière liaison → le document disparaît)
