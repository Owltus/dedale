# 0009 — Le catalogue commun est une réserve, pas une source vive

- **Date** : 2026-09-09
- **Statut** : accepté

## Contexte

Les catalogues de la Bibliothèque (modèles d'équipements, modèles
d'opérations, gammes-templates, modèles de DI) existent à deux niveaux :
`site_id NULL` = commun à l'entreprise, `site_id` renseigné = propre à un
site. Rien, jusqu'ici, ne disait ce que ce commun est **pour un utilisateur
de site**, et l'application répondait de deux façons contradictoires selon
l'écran :

- la création d'une demande d'intervention n'a jamais proposé les modèles de
  DI communs, avec ce commentaire explicite dans la query : « seuls les
  modèles réellement présents sur le site sont proposés, sinon la liste
  mélange des templates non déployés » ;
- le gabarit d'une sous-catégorie d'équipements et le rattachement d'un
  modèle d'opération à une gamme, eux, mélangeaient commun et site.

L'ambiguïté a coûté une demi-journée : un modèle « BAES » créé dans le
commun n'apparaissait nulle part côté site, sans que rien n'explique
pourquoi — la base refusant, elle, qu'une sous-catégorie de site pointe un
modèle commun (`check_categorie_modele`).

Le PO a tranché en énonçant le modèle mental : **le siège propose, le site
dispose.** Les gens du siège produisent des gabarits pour faciliter le
travail des techniciens ; les techniciens choisissent de s'en servir ou non.
« Malgré que les gens du siège soient hiérarchiquement supérieurs, c'est le
bas de l'échelle qui dirige. »

## Décision

Le catalogue commun est une **réserve** dans laquelle un site vient se
servir, jamais une source dont un écran de site dépendrait.

1. **Cloison en lecture.** Hors de la Bibliothèque, un écran de site ne
   propose que ce qui est rattaché au site. La règle est portée par les
   **queries** (`modelesEquipementsQueries.list`,
   `modelesOperationsQueries.liables`, `demandesQueries.modelesDi.list`,
   `gammesQueries.list`), jamais par un filtre de composant : un futur écran
   qui réutilise la query hérite de la règle sans avoir à la connaître.
2. **Un geste pour se servir.** Depuis la Bibliothèque, sous le périmètre
   d'un site, « Importer depuis le commun » installe une **copie
   indépendante** des éléments choisis (RPC `copier_modele_equipement`,
   `copier_modele_operation`, `copier_gamme` ; insert direct pour les modèles
   de DI, faute de RPC). Ouvert aux rôles métier ayant accès au site — un
   technicien s'équipe seul, sans passer par le siège.
3. **La copie est indépendante.** Modifier l'original au siège ne touche
   jamais ce qui tourne sur un site. Corollaire : le siège ne peut pas non
   plus corriger en masse ce qui est déjà déployé.
4. **Garde-fous en base**, pour que la règle ne dépende pas du front :
   `check_categorie_modele` (une sous-catégorie de parc ne pointe qu'un
   modèle de son site) et `check_gamme_modele_meme_perimetre`
   (migration 113 : une liaison gamme ↔ modèle d'opérations exige un
   périmètre identique des deux côtés).

## Conséquences

- Un site qui ne voit « rien » dans un menu de gabarit n'est pas un bug :
  c'est qu'il n'a rien installé. Les écrans concernés le disent et renvoient
  vers la Bibliothèque.
- Le même nom peut exister deux fois (l'original commun, la copie du site) ;
  c'est voulu. L'installation matérialise au besoin la catégorie d'accueil
  côté site, d'où des catégories homonymes selon le périmètre affiché.
- La détection de doublon à l'installation se fait par **nom** : un élément
  renommé après coup pourra être réinstallé.
- Ce que cette décision ne couvre pas : les **documents** (un fichier commun
  reste rattachable à un site — on partage un fichier, on ne déploie pas un
  gabarit), les **catégories** (l'arborescence de rangement reste partagée,
  sinon chaque site recréerait le même classement), et les **vignettes**
  (pool commun utilisable partout, garanti par `miniature_scope_ok`).
