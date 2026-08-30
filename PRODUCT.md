# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Le **technicien de terrain** est le rôle central : « c'est vraiment lui qui fait vivre l'app » (citation PO). Il travaille sur le ou les sites qui lui sont assignés, souvent en mobilité, téléphone en main, entre deux tâches — plein pouvoir métier sur son périmètre (interventions, tâches, documents, statuts).

Les quatre autres rôles gravitent autour de lui :

- **admin** — contrôle total et transverse, supervision et paramétrage de toute l'entreprise (« Dieu le père », citation PO).
- **manager** — sous la tutelle de l'admin, beaucoup de droits mais limités aux sites où il travaille.
- **lecteur** — consultation seule des données, aucune modification possible.
- **demandeur** — rôle très restreint, uniquement la création de demandes d'intervention. Ne doit jamais recevoir le poids d'une interface complète pour une action aussi simple.

## Product Purpose

GMAO (gestion de maintenance) pour un Établissement Recevant du Public (ERP) français : suivi des lieux (sites → bâtiments → niveaux → locaux → équipements), des interventions (curatif via demandes, préventif/réglementaire via ordres de travail et gammes), des prestataires/contrats, des investissements, et des documents réglementaires (CERFA, VGP, commissions de sécurité...). Le succès se mesure à ce que la maintenance réelle du bâtiment passe par l'outil plutôt que par des tableurs ou du papier.

## Positioning

Outil opéré **un client à la fois** — chaque instance appartient à une seule entreprise (doctrine single-tenant, jamais de notion de client multiple dans une même instance), qui peut elle-même opérer **plusieurs sites physiques**. Le client actuel travaille dans l'hôtellerie (Okko), mais l'outil est pensé pour être redéployé demain chez une entité complètement différente — confirmé par le PO : « demain cela pourrait être une autre entité ». Vérifié dans le code source (`src/`) : aucune référence en dur à Okko ou à l'hôtellerie — les décisions de design doivent rester génériques, jamais spécifiques à un secteur.

## Operating Context

Une instance peut couvrir plusieurs sites physiques appartenant au même client. Le contexte réglementaire est dense et spécifiquement français (CERFA, VGP, commissions de sécurité, contrôles Bureau Veritas, extincteurs, ascenseurs, désenfumage...). Le technicien opère souvent en situation de mobilité — d'où la doctrine mobile-first déjà en place dans le code (`PageContainer`, grilles responsives).

## Capabilities and Constraints

- 5 rôles avec accès borné **par site** (jamais d'assignation nominative individuelle) : voir Users ci-dessus pour le détail de chacun.
- **Hard-delete** : pas de corbeille/soft-delete ; les garde-fous sont des contraintes de clé étrangère (RESTRICT/CASCADE).
- Le **backend Supabase porte toute la logique métier et la sécurité** (RLS) — le front présente et consomme, il ne valide jamais lui-même une règle métier.
- **Tout en français** — interface, messages d'erreur, contenus.

## Brand Commitments

Nom « Dédale », logo labyrinthe (visible sur l'écran de connexion). Aucune autre contrainte de marque confirmée à ce stade — palette, typographie et ton restent à documenter/décider lors d'un travail de design ultérieur (hors périmètre de cet `init`).

## Evidence on Hand

Outil interne opérationnel, sans page publique ni marketing — aucun témoignage ou étude de cas à produire. Le contenu réel provient des données du client actif (documents réglementaires, historique d'interventions) ; rien à inventer pour les écrans produit.

## Product Principles

- Le technicien de terrain est la priorité absolue de l'ergonomie — ne jamais le ralentir au profit d'un besoin de supervision.
- Chaque rôle reçoit une interface proportionnée à son usage réel ; le demandeur en particulier ne doit jamais porter le poids complet de l'application.
- Rester générique — ne jamais coder en dur les particularités d'un client donné (vérifié : aucune trace d'un secteur ou d'une entreprise spécifique dans le code source).
- Le front présente, la base valide — aucune logique métier dupliquée côté client.

## Accessibility & Inclusion

Aucune exigence spécifique confirmée à ce stade.
