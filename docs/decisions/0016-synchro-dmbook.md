# 0016 — Synchro Dmbook ⇄ Dédale : Dmbook fait foi, Dédale s'adapte

- **Date** : 2026-11-23
- **Statut** : accepté. Décisions du PO, prises du 20 au 22/11/2026 (D1 à D21).
  Mise en œuvre :
  - 163 : socle de connexion ;
  - 164 : liens ticket ⇄ DI, file d'envoi, déclencheurs anti-écho ;
  - 165 : une connexion par site, réglée dans Dédale, et l'auteur Dmbook ;
  - 166 : tâche planifiée et réveil immédiat ;
  - 167 : passages toutes les 5 minutes jusqu'à 23 h ;
  - fonctions `dmbook-connexion` et `dmbook-sync` ;
  - `src/features/dmbook/`.

  Synchro en service dans les deux sens depuis le 23/11/2026.

## Contexte

Sur le terrain, les demandes d'intervention se saisissent dans **Dmbook**, le
carnet de liaison de l'établissement : texte libre, statut Ouvert / En cours /
Fermé. Dédale doit montrer les mêmes demandes, avec leur lieu, et pouvoir les
faire avancer.

Le 19/11/2026, les 4 060 tickets historiques ont été importés une fois, depuis 2021. Le PO voulait ensuite une **vraie synchro dans les deux sens** :

- elle doit être autonome ;
- elle doit gérer tous les statuts ;
- elle ne doit pas créer « deux timelines différentes ».

Contraintes :

- **Dmbook n'a pas d'API.** Dédale lit et écrit ses pages comme un navigateur,
  avec la session d'un compte Dmbook. Le format peut changer sans prévenir.
- **La connexion peut exiger un code envoyé par e-mail.** Chaque nouvelle
  tentative en envoie un autre. Le PO ne veut aucun envoi en rafale.
- **Les deux outils ne se ressemblent pas.** Le lieu Dmbook n'est qu'un
  « #112 » en tête du texte. Dmbook n'a pas de lieux structurés.
- **Une fonction serveur a peu de mémoire.** Lire les 82 pages de la liste
  avec un vrai lecteur de pages dépassait la limite (`WORKER_RESOURCE_LIMIT`).

## Décision

1. **Dmbook est la source de vérité.** Une modification faite dans Dédale part
   tout de suite, et seulement pour cette demande. Avant d'écrire, le serveur
   relit le ticket. S'il a bougé dans Dmbook depuis le dernier passage, c'est
   **Dmbook qui gagne** : la modification Dédale est écartée
   (`remplace_par_dmbook`). Ce choix remplace « la plus récente gagne » du
   20/11.
2. **Le lien est l'identifiant Dmbook** (`dmbook_liens`). Deux empreintes, une
   par côté, disent ce qui a changé et où. Un ticket né dans Dédale a un auteur
   vide, ce qui n'affiche pas « Signalé dans Dmbook par… ».
3. **Pas d'écho.** Les écritures de la synchro posent
   `dedale.synchro_dmbook = on`, et les déclencheurs de 164 ne déposent alors
   rien dans la file. Seuls les gestes d'une personne partent vers Dmbook.
4. **Correspondances** :
   - **Statuts** : Ouvert ↔ Ouvert, En cours ↔ En cours, Fermé ↔ Clôturé.
   - **Texte envoyé** : « #112 constat » pour une chambre, le constat seul pour
     un autre lieu.
   - **Chambre changée dans Dédale** : seule la tête « #112 » du texte Dmbook
     est corrigée, le reste n'est pas touché.
   - **Lieux lus dans Dmbook** : les chambres sont trouvées dans le texte.
   - **Autres lieux** : ils se choisissent à la main dans Dédale, et ce choix
     est gardé, sauf si le nouveau texte cite une chambre.
   - **Texte ambigu** : la demande reste sans lieu. On ne devine jamais.
   - **Commentaires** : pas synchronisés.
5. **Suppressions en miroir, mais prudentes.**
   - Un ticket ne se supprime pas dans Dédale parce qu'il manque dans la
     liste : il faut avoir confirmé, ticket par ticket, que sa fiche a disparu.
   - Si Dmbook répond mal, on garde tout et on réessaie plus tard.
6. **Rythme** (`dmbook_tic`, pg_cron toutes les 5 minutes) :
   - le jour, de 7 h à 23 h (heure de Paris), un passage toutes les 5 minutes (19 h au départ, élargi par la migration 167 le 23/11) ;
   - la nuit, un passage par heure.
   - **Chaque passage** lit les tickets Ouverts et En cours, et les nouveaux.
     Il compare leur date de modification avant d'ouvrir une fiche, ce qui fait
     2 lectures en général.
   - **Une fois par heure**, un tour complet attrape les tickets fermés qui ont
     été modifiés ou supprimés.
   - **Une action dans Dédale** réveille l'envoi aussitôt : un déclencheur sur
     `dmbook_file` appelle `pg_net`, une seule fois par transaction.
   - **Lecture « légère »**, par expressions, sans lecteur de pages, pour tenir
     dans la mémoire du serveur.
7. **Une connexion par site** (`dmbook_connexions`), réglée dans Dédale par un
   admin, un manager ou le technicien du site. Les identifiants et la session
   sont rangés **chiffrés dans le coffre Supabase**. Ni le front ni le dépôt ne
   les voient. Claude ne les saisit ni ne les affiche jamais.
8. **Code e-mail** : une seule tentative de connexion. Si Dmbook demande un
   code, la synchro s'arrête, Dédale affiche un bandeau, et le code se saisit
   dans l'application. Il n'y a jamais de nouvel essai automatique ni de
   « renvoyer le code ».
9. **Ouverture progressive de l'écriture**, par le secret `DMBOOK_ECRITURE` :
   - `aucune` : rien n'est écrit dans Dmbook ;
   - `test` : seules les demandes « ZZ TEST » sont écrites ;
   - `toutes` : toutes les demandes sont écrites. C'est le réglage depuis le
     23/11, après le test complet validé par le PO (création, texte, statut,
     suppression).

## Conséquences

- **Arrêt d'urgence** :
  - `UPDATE dmbook_connexions SET etat = 'pause' WHERE site_id = …` arrête la
    tâche et le réveil pour ce site ;
  - `DMBOOK_ECRITURE=test` (ou `aucune`) coupe l'écriture et garde la lecture ;
  - `SELECT cron.unschedule('dmbook_synchro')` arrête la tâche planifiée.
- **Une panne de Dmbook n'empêche jamais d'enregistrer dans Dédale.** L'action
  attend dans la file. Après 5 échecs, elle est mise de côté (`mis_de_cote`).
- **Toute écriture faite en lot sur les DI** (correction, ajout de lieux) doit
  poser `dedale.synchro_dmbook = on`. Sans cela, chaque ligne part vers Dmbook
  et réécrit de vieux tickets que l'équipe verrait changer. Cela a été fait
  ainsi le 23/11 pour localiser 11 anciennes demandes.
- **Une modification Dédale peut être perdue** si le ticket a bougé dans Dmbook
  au même moment. C'est voulu (point 1).
- **Fragilité assumée** : un changement de mise en page de Dmbook peut casser
  la lecture. Les tests `client.test.ts` figent les formats connus. En cas de
  doute, la synchro garde l'existant plutôt que de détruire.
- **Ce qui n'est pas synchronisé** : les commentaires et l'auteur
  côté Dédale. L'auteur Dmbook est affiché tel qu'écrit, sans jamais deviner son
  compte Dédale.
- **Dépôt public** : aucune page Dmbook réelle, aucun nom de personne ni texte
  de l'établissement dans le code ou les tests. Les exemples sont fictifs.
