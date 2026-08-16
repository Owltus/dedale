# 0007 — Création de comptes sans e-mail

- **Date** : 2026-08-17
- **Statut** : accepté

## Contexte

La création d'un compte passait par une invitation : l'administrateur saisissait
une adresse, Supabase envoyait un e-mail contenant un lien, et la personne
définissait son mot de passe sur l'écran `/definir-mot-de-passe`.

Deux constats ont motivé l'abandon de ce flux.

Le premier est opérationnel : le PO ne maîtrise pas la couche e-mail et ne veut
pas en dépendre. Envoi, délivrabilité, expéditeur, quota — autant de choses à
régler chez un tiers pour une application qui compte une poignée de comptes.

Le second est factuel : **le flux était cassé en production**. Le secret
`APP_URL`, que l'Edge Function lisait pour construire le lien de retour, n'avait
jamais été défini. La fonction retombait donc sur son défaut,
`http://localhost:5181`. Toute personne invitée recevait un lien vers le poste
d'un développeur. Personne ne s'en était aperçu parce que personne n'avait
encore été invité en production.

## Décision

L'administrateur — ou le manager, dans son périmètre — saisit lui-même l'adresse
**et** le mot de passe. Le compte est utilisable immédiatement. Aucun e-mail ne
part, à aucun moment du cycle de vie d'un compte.

- **Création** : `auth.admin.createUser` remplace `auth.admin.inviteUserByEmail`
  dans l'Edge Function `invite_user` (nom conservé, voir plus bas).
- **Oubli de mot de passe** : un administrateur ou un manager le redéfinit
  depuis la fiche de la personne (Edge Function `set_user_password`).
- **Changement volontaire** : depuis son profil, en fournissant l'ancien.
- **L'écran `/definir-mot-de-passe` est supprimé.**

Qui peut redéfinir le mot de passe de qui : un administrateur sur tout compte
sauf le sien ; un manager sur les techniciens, lecteurs et demandeurs partageant
un de ses sites. **L'auto-modification par cette voie est refusée aux deux** :
on change son propre mot de passe depuis son profil, ce qui exige de connaître
l'ancien. Sans ce garde-fou, un administrateur contournerait cette exigence sur
lui-même, et quiconque emprunterait une session ouverte aussi.

Règles de mot de passe : douze caractères, une majuscule, une minuscule, un
chiffre, un caractère spécial. Elles vivent dans `PASSWORD_REGLES`
(`src/features/utilisateurs/schemas.ts`), qui sert à la fois d'affichage et de
validation.

## Trois invariants techniques à ne jamais casser

Ils ne se devinent pas à la relecture du code. Chacun a été vérifié dans le code
source de GoTrue, pas déduit de la documentation.

**1. `email_confirm: true` à la création.** Sans lui, GoTrue refuse la connexion
(`email_not_confirmed`) — et comme aucun e-mail n'est parti, la personne n'a
aucun moyen de se débloquer : le compte est mort-né. Désactiver « Confirm
email » dans le tableau de bord Supabase n'y change rien, ce réglage n'agit que
sur `/signup`.

**2. `role` dans `user_metadata`, jamais à la racine de `createUser`.** À la
racine, `role` est un champ réservé qui écrit le rôle Postgres du JWT : le compte
perdrait son claim `authenticated` et toute la RLS casserait pour lui. Le piège
est d'autant plus facile que `role` est une variable en scope au point d'appel.
Contrôle de non-régression : le claim `role` du jeton d'un compte créé doit
valoir `authenticated`, et le rôle métier doit être dans `user_metadata`.

**3. La validation du mot de passe est à notre charge.** `adminUserCreate`
n'appelle pas `checkPasswordStrength` — ce contrôle n'existe que dans
`adminUserUpdate`. La politique de mot de passe du projet Supabase est donc sans
effet à la création : sans validation dans l'Edge Function, un compte au mot de
passe `a` serait accepté, et se verrait refuser la connexion plus tard si la
politique projet venait à être durcie.

Corollaire : les règles existent en **trois** exemplaires — le schéma Zod du
front, et la validation de chacune des deux Edge Functions. Deno ne peut pas
importer le module du front. Les trois listes doivent évoluer ensemble ; chacune
porte un commentaire le rappelant.

## Ce que cette décision coûte

**L'administrateur connaît le mot de passe initial.** Il doit le transmettre par
un canal sûr. L'interface ne le restitue jamais après la création (ni encart, ni
bouton de copie) : il ne transite donc pas par le presse-papiers, et un mot de
passe non noté se redéfinit — il ne se retrouve pas.

**Il n'y a plus de récupération autonome.** Qui oublie son mot de passe s'adresse
à un administrateur ou à son manager. C'est acceptable à l'échelle d'un
établissement ; ça ne le serait pas pour un produit grand public.

**Plus de porte de secours dans l'application.** L'écran `/definir-mot-de-passe`
recevait aussi les liens de récupération émis depuis le tableau de bord Supabase.
Sa suppression retire ce dernier recours.

> **Conséquence opérationnelle : maintenir au moins deux comptes administrateur.**
> Avec un seul, sa perte rendrait l'application inadministrable depuis
> l'application elle-même. Le recours resterait possible, mais uniquement en
> passant par le tableau de bord Supabase et en recréant un écran de définition
> de mot de passe.

## Alternatives écartées

**Configurer un service d'envoi (Resend, Brevo…).** C'était la réponse naturelle
au quota et à l'expéditeur générique. Écartée parce qu'elle ne supprime pas la
dépendance : elle la déplace chez un tiers de plus, avec des réglages DNS à
tenir. Le PO veut moins de couches, pas d'autres couches.

**Forcer le changement de mot de passe à la première connexion.** Aurait limité
la portée du « l'administrateur connaît le mot de passe ». Écartée : elle exige
une colonne `must_change_password`, donc une migration, alors que ce chantier
n'en demande aucune. À rouvrir si l'usage le réclame.

## Conséquences sur la base

**Aucune migration.** Le trigger `handle_new_auth_user` ne lit que l'identifiant,
l'e-mail et les métadonnées de `auth.users` : rien qui dépende du mode de
création. Aucune colonne, contrainte, policy ou tâche planifiée ne référence
l'invitation, la confirmation d'e-mail ou un statut « en attente ». Le commentaire
du schéma anticipait d'ailleurs explicitement le cas `createUser`.

Le secret `APP_URL` n'est plus lu par aucune fonction. Il n'était pas défini ; ne
pas le recréer.

## Dette assumée

L'Edge Function s'appelle toujours `invite_user` alors qu'elle n'invite plus. La
renommer imposerait de déployer la nouvelle avant le front, puis de supprimer
l'ancienne après, sous peine de coupure — pour un gain nul. C'est documenté en
tête de la fonction et au point d'appel côté front, afin que ce ne soit pas pris
pour un oubli.
