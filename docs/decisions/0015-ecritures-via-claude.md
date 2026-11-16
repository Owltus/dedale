# 0015 — Claude n'écrit dans Dédale que par des gestes nommés, avec aperçu puis code

- **Date** : 2026-11-15
- **Statut** : accepté (décisions du PO des 14 et 15/11/2026). Mise en œuvre, le
  même jour :
  - 156 : droit d'écriture et trace `via_client` ;
  - 157 : garde d'entrée de l'API ;
  - 158 : six gestes sur les ordres de travail ;
  - 159 (16/11) : cinq gestes sur les demandes d'intervention ;
  - 160 (16/11) : le lieu montré par Claude commence par le site ;
  - fonction `mcp` : outils d'écriture.

## Contexte

Le connecteur Claude (MCP, migrations 153 à 155) lisait Dédale avec le jeton
OAuth de la personne : sa RLS, ses sites, son rôle. Le PO voulait que Claude
enregistre aussi l'avancement d'un OT, à partir de phrases comme « j'ai fini la
ronde : 58 °C, 52 °C » ou « j'ai fait les filtres du R+2, pas les moteurs ».
Il ne voulait pas qu'il puisse « faire n'importe quoi ».

Deux faits rendaient la RLS seule insuffisante :

- **Le jeton du connecteur est un jeton Supabase ordinaire.** Utilisé
  directement contre l'API, il permettait déjà toute écriture que la personne a
  le droit de faire, y compris une suppression ou l'appel d'une RPC `SECURITY
DEFINER`, hors des outils du connecteur.
- **Un modèle de langage peut se tromper d'opération**, de date ou de valeur.

## Décision

1. **Le statut d'un OT n'est jamais écrit par Claude.** Claude enregistre des
   opérations : faite, mesure, non applicable, en cours, en attente,
   commentaire. La base en déduit le statut de l'OT, la clôture ou l'annulation
   automatique, et l'OT suivant (`gestion_statut_ot`,
   `validation_transitions_ot`). Aucune règle métier n'est recodée. Cinq gestes
   sur l'OT complètent : replanifier, rouvrir, reclôturer un OT rouvert,
   annuler, réactiver.
2. **Les écritures passent uniquement par des fonctions `claude_*`**, en
   SECURITY INVOKER, donc avec la RLS et les triggers de la personne.
3. **Une garde d'entrée PostgREST (`pgrst.db_pre_request`) ferme tout le
   reste.** Via un connecteur (claim `client_id`), elle ne laisse passer que :
   - la lecture (GET) ;
   - `current_role` et `get_my_sites` ;
   - les RPC `claude_*`.

   Une requête de l'application sort dès la première ligne. Ce choix est
   préféré à des policies restrictives table par table, qui ne couvraient pas
   les RPC `SECURITY DEFINER`.

4. **Aperçu, puis code.** Chaque geste s'appelle d'abord en aperçu : les
   écritures sont réellement jouées dans un sous-bloc PL/pgSQL, le résultat est
   relu, puis tout est annulé. L'aperçu rend un code, empreinte de la demande et
   de l'état de l'OT. L'enregistrement exige ce code.

   La base garantit que **ce qui est écrit est exactement ce qui a été montré,
   sur l'OT tel qu'il était**. Elle ne peut pas garantir qu'un humain a dit
   oui : cela repose sur la consigne du connecteur et le réglage « Approbation
   requise » de claude.ai.

5. **Le droit est un 3e niveau de l'interrupteur** : Désactivé / Lecture /
   Lecture et modification (`acces_ia_ecriture`, qui suppose `acces_ia`). Il
   s'accorde par un admin, depuis l'application seulement.
6. **Trace** : `audit_log.via_client` est rempli quand l'appel vient d'un
   connecteur.
7. **Choix du PO pour les saisies** :
   - aperçu à chaque fois ;
   - dates sans limite dans le passé, mais jamais dans le futur ;
   - « non applicable » sans raison exigée mais **avec sa date**, qui fait la
     date de clôture si tout l'OT s'annule ;
   - Claude guide (ce qui est fait, ce qui reste) au lieu de deviner.

## Demandes d'intervention (migration 159, 16/11/2026)

Même modèle : cinq fonctions `claude_*_demande` (créer, corriger, prendre en
charge, clôturer, rouvrir), aperçu puis code. Le cycle reste celui de 052
(création « Ouvert », triggers de résolution). Choix du PO :

- **Lieu obligatoire, un seul local par DI**, équipements facultatifs mais
  obligatoirement dans ce local. Plusieurs endroits = plusieurs DI.
- **Problèmes courants du site seulement** (ADR 0009) : Claude s'en sert pour
  formuler le constat.
- **Constat factuel** : symptôme, endroit précis, depuis quand, conséquence ;
  ni cause supposée ni remède. 15 à 4 000 caractères.
- **Doublon possible et constat ancien signalés**, jamais bloquants.
- **Clôture** : note de résolution facultative, date de l'intervention
  (jamais future ni avant le constat).
- **Réouverture** : motif obligatoire, ajouté daté à la fin du constat, faute
  de champ dédié.
- Un demandeur ne corrige que le constat de sa DI encore « Ouvert » (RLS) ;
  changer le lieu lui est refusé explicitement.
- **Plusieurs sites** : le lieu d'un aperçu commence par le nom du site (160) ;
  la consigne du connecteur impose de nommer le site et de demander lequel
  en cas de doute. Un résultat vide peut signifier « pas le droit de voir »
  (un demandeur ne voit ni OT ni contrats) : Claude ne conclut pas à
  l'absence.

## Conséquences

- **Ajouter une écriture via Claude = écrire une fonction `claude_*`.**
  Ailleurs, elle sera refusée par la garde. Une nouvelle RPC de **lecture**
  utilisée par le connecteur doit être ajoutée à la liste de
  `garde_connecteur`.
- **Fermés à Claude** :
  - suppressions (OT comme DI) ;
  - création d'OT ;
  - problèmes courants (`modeles_di`) ;
  - changement de gamme, de site ou de prestataire ;
  - remplacement de compteur ;
  - fichiers ;
  - observations réglementaires.
- Retour arrière de la garde :
  `ALTER ROLE authenticator RESET pgrst.db_pre_request; NOTIFY pgrst, 'reload config';`
