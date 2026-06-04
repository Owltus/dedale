# Étape 13 — Transverse : Documents

## Objectif

Bibliothèque documentaire centrale + rattachement de fichiers aux entités (OT, gammes, contrats,
prestataires, locaux, équipements, DI…).

## Contexte

Backend : table `documents` (site*id, storage_path, hash, chapitre_id) + tables de liaison
`documents*\*`par entité. Bucket Storage`documents`(privé, RLS). **Upload = 3 étapes** :
(a) upload Storage, (b) insert`documents`(avec`site_id`), (c) insert dans la table de liaison.

## Fichier(s) impacté(s)

- `src/features/documents/` (upload, liste, rattachements)
- `src/components/common/` : `DocumentsTab` réutilisable (à embarquer dans les fiches métier)
- `src/routes/_app/documents.tsx`

## Travail à réaliser

1. Liste/bibliothèque (cartes : type, taille, nb rattachements), recherche, prévisualisation/téléchargement.
2. **Composant d'upload réutilisable** appliquant les 3 étapes, à brancher dans les onglets « Documents » des fiches.
3. Suppression (soft-delete) + gestion des rattachements (lier/délier).

## Critère de validation

- Uploader un PDF, le rattacher à un OT, le retrouver dans l'onglet Documents de l'OT et le télécharger.
- Un document non rattaché n'est pas visible hors de la bibliothèque (RLS Storage).

## Contrôle (audit manuel — étape critique)

- Les 3 étapes d'upload sont respectées (jamais d'objet Storage orphelin sans ligne `documents`).
- `site_id` toujours renseigné ; pas de fuite inter-sites ; types/MIME conformes au bucket (pdf + webp, 20 Mo).
