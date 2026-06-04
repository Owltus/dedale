# Étape 16 — Comptes : Edge Function invite_user & gestion des utilisateurs

## Objectif

Permettre la **création de comptes** (par invitation) et la gestion des utilisateurs (rôle + sites),
dans le respect de la cascade d'invitation.

## Contexte

Aujourd'hui seul l'admin bootstrap existe. Le trigger `handle_new_auth_user` peuple `public.users` +
`user_sites` depuis `raw_app_meta_data`. Il manque l'**Edge Function `invite_user`** (service_role)
qui pose ces métadonnées et envoie l'invitation. Cascade : admin → tous ; manager → tech/lecteur/demandeur ; etc.

## Fichier(s) impacté(s)

- `supabase/functions/invite_user/` (Edge Function Deno — infra)
- `src/features/utilisateurs/` + `src/routes/_app/utilisateurs.tsx`

## Travail à réaliser

1. **Edge Function `invite_user`** (service_role) : `invite_user(email, role, nom_complet, created_by, site_ids[])`
   → `auth.admin.inviteUserByEmail(email, { data: {...} })`. Réservée admin/manager (cascade), validations.
2. Écran utilisateurs (admin/manager) : liste, inviter (rôle + sites), désactiver (kill-switch `est_actif`),
   anonymiser (RGPD, RPC `anonymize_user`).
3. Gérer l'auth/headers pour appeler l'Edge Function depuis le front.

## Critère de validation

- Un admin invite un technicien sur un site ; le compte est créé avec le bon rôle et les bons sites.
- Un rôle non autorisé ne peut pas inviter au-delà de sa cascade.

## Contrôle (audit manuel — étape critique)

- La clé `service_role` reste **uniquement** dans l'Edge Function (jamais dans le front).
- Validation stricte de la cascade de rôles côté Edge Function (pas seulement côté UI).
