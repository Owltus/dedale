# 0014 — La nature d'une gamme dit pourquoi on intervient ; le document exigé se règle gamme par gamme

- **Date** : 2026-11-08
- **Statut** : accepté (décisions du PO du 08/11/2026). Mise en œuvre, le même
  jour :
  - 131 : valeurs de l'ENUM ;
  - 132 : interrupteur, vue, reclassement ;
  - 133 : passage de 8 à 7 natures ;
  - 134 : la nature n'impose plus de document.

## Contexte

`gammes.nature` n'avait que deux valeurs, `controle_reglementaire` et
`maintenance_preventive`, et faisait deux métiers à la fois :

- dire **pourquoi** on intervient ;
- dire **s'il faut une preuve** : l'alerte du tableau de bord ne signalait que
  les OT réglementaires clôturés sans document.

Pour obtenir l'alerte, des entretiens étaient classés « réglementaires »
(machine à glaçons, fontaine, portail…). Le registre de sécurité et les hachures
du planning les comptaient alors comme des obligations légales. À l'inverse, un
document manquant sur une maintenance (bon d'intervention d'un ascensoriste) ne
remontait jamais.

## Décision

1. **Sept natures, purement descriptives**, établies à partir des 102 gammes
   réelles du site. Chacune répond à « qui intervient, et pourquoi ? » :

   | Nature                   | On y range une gamme si…                               |
   | ------------------------ | ------------------------------------------------------ |
   | `controle_reglementaire` | un organisme la vérifie parce que la loi l'oblige      |
   | `hygiene_sanitaire`      | elle protège la santé des occupants                    |
   | `formation_habilitation` | elle porte sur une personne                            |
   | `maintenance_preventive` | on agit **sur** l'équipement (équipe ou prestataire)   |
   | `controle_interne`       | l'équipe **vérifie** que tout fonctionne, sans réparer |
   | `releve_compteurs`       | on note une valeur                                     |
   | `gestion_administrative` | une échéance sans geste technique (badges…)            |

   La 132 en avait posé huit ; le PO les a jugées trop nombreuses et mal
   nommées. La 133 a donc :
   - fusionné « sous contrat » et « interne » dans `maintenance_preventive`,
     car qui intervient ne change pas la nature ;
   - renommé `autocontrole` en `controle_interne` ;
   - renommé `suivi_administratif` en `gestion_administrative`, une catégorie
     volontairement large (assurances, abonnements, renouvellements).

2. **Le document exigé est l'interrupteur `gammes.document_requis`, et lui
   seul.** Il est désactivable sur toute nature (134). Un contrôle obligatoire
   peut ne produire qu'un rapport **annuel**. Une règle « toujours exigé » par
   nature faisait alors remonter chaque passage en document manquant, sans
   recours possible.
3. **Coché d'office, pas imposé.** À la création d'une gamme
   `controle_reglementaire`, `hygiene_sanitaire` ou `formation_habilitation`,
   les formulaires et l'import CSV cochent la case. C'est une aide de saisie
   portée par le front (`NATURES_DOCUMENT_COCHE_DOFFICE`), que la base ignore.
   En édition, changer la nature ne touche jamais la case.
4. **L'alerte « Documents manquants »** lit la vue `v_ot_documents_manquants`.
   Elle liste les OT clôturés dont la gamme exige un document et qui n'en ont
   aucun. **L'historique est compris**, à la demande du PO.
5. **`maintenance_interne` et `maintenance_sous_contrat` sont obsolètes.**
   PostgreSQL ne sait pas retirer une valeur d'ENUM. Plus aucune ligne ne les
   porte et le front ne les propose plus. L'import CSV accepte encore les
   anciens libellés (« Réglementaire », « Maintenance », « Autocontrôle »…).

## Conséquences

- **Passage sans perte.** La 134 a activé l'interrupteur sur les 28 gammes que
  leur nature obligeait (réglementaire, hygiène, formation). La 133 l'avait déjà
  activé sur les 11 gammes de prestataires et la machine à glaçons. Total :
  40 gammes, et 20 documents manquants avant comme après.
- **Le reclassement couvre aussi les OT clôturés.** C'est une exception voulue
  à « clôturé = immuable » : la nature figée sur l'OT est corrigée, pas
  réécrite. Les protections ont été suspendues le temps de la seule transaction
  (132, puis 133), et `audit_log` en garde la trace.
- **L'interrupteur est lu en direct sur la gamme**, sans être figé sur l'OT. Le
  basculer fait apparaître ou disparaître tout son historique dans l'alerte.
  C'est ce que veut le PO.
- **Le modèle de la Bibliothèque porte aussi l'interrupteur**, que
  `copier_gamme` recopie sur le site.
- **`check_derniere_op_preventive` s'applique désormais à toutes les natures.**
  Il ne visait que `maintenance_preventive`. C'est la même règle que celle qui
  s'applique déjà à la création d'un OT.
- **Pas encore touchés**, volontairement :
  - le registre de sécurité (`v_registre_securite`, en développement) ne garde
    que `controle_reglementaire` ;
  - les hachures du planning et du cadran restent sur `controle_reglementaire`.
