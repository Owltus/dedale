-- =============================================================================
-- Martin / Phase 1bis — AUDIT DE COHERENCE DES DONNEES REELLES — LECTURE SEULE
-- =============================================================================
-- Aucune ecriture. Chaque ligne = un invariant metier ; la colonne `lignes`
-- compte les enregistrements qui le VIOLENT. Tout ce qui est > 0 est un finding
-- dont la requete ci-dessous est l oracle.
-- =============================================================================
with v as (

-- Cycle de vie des ordres de travail
select 'OT01 cloture sans date_cloture' i, count(*) n from ordres_travail where statut='cloture' and date_cloture is null
union all select 'OT02 date_cloture posee hors cloture', count(*) from ordres_travail where statut in ('planifie','en_cours','reouvert') and date_cloture is not null
union all select 'OT03 date_cloture < date_debut', count(*) from ordres_travail where date_cloture is not null and date_debut is not null and date_cloture < date_debut
union all select 'OT04 date_cloture dans le futur', count(*) from ordres_travail where date_cloture > now()
union all select 'OT05 date_debut dans le futur', count(*) from ordres_travail where date_debut > now()
union all select 'OT06 cloture sans aucune operation', count(*) from ordres_travail o where o.statut='cloture' and not exists (select 1 from operations_execution e where e.ordre_travail_id=o.id)
union all select 'OT07 cloture avec une operation encore en attente', count(*) from ordres_travail o where o.statut='cloture' and exists (select 1 from operations_execution e where e.ordre_travail_id=o.id and e.statut in ('en_attente','en_cours'))
union all select 'OT08 date_debut <> MIN(date_execution) [migration 082]', count(*) from (select o.id from ordres_travail o join operations_execution e on e.ordre_travail_id=o.id where o.statut='cloture' and e.date_execution is not null group by o.id, o.date_debut having o.date_debut is distinct from min(e.date_execution)) z
union all select 'OT09 date_cloture <> MAX(date_execution) [migration 082]', count(*) from (select o.id from ordres_travail o join operations_execution e on e.ordre_travail_id=o.id where o.statut='cloture' and e.date_execution is not null group by o.id, o.date_cloture having o.date_cloture is distinct from max(e.date_execution)) z
union all select 'OT10 annule sans motif_annulation', count(*) from ordres_travail where statut='annule' and (motif_annulation is null or btrim(motif_annulation)='')
union all select 'OT11 rouvert sans motif_reouverture', count(*) from ordres_travail where statut='reouvert' and (motif_reouverture is null or btrim(motif_reouverture)='')
union all select 'OT12 jours_periodicite <= 0', count(*) from ordres_travail where jours_periodicite <= 0
union all select 'OT13 tolerance_jours < 0', count(*) from ordres_travail where tolerance_jours < 0
union all select 'OT14 snapshot nom_gamme derive (OT non cloture)', count(*) from ordres_travail o join gammes g on g.id=o.gamme_id where o.statut in ('planifie','en_cours','reouvert') and o.nom_gamme is distinct from g.nom
union all select 'OT15 snapshot nom_prestataire derive (OT non cloture)', count(*) from ordres_travail o join prestataires p on p.id=o.prestataire_id where o.statut in ('planifie','en_cours','reouvert') and o.nom_prestataire is distinct from p.libelle
union all select 'OT16 snapshot nature_gamme derive (OT non cloture)', count(*) from ordres_travail o join gammes g on g.id=o.gamme_id where o.statut in ('planifie','en_cours','reouvert') and o.nature_gamme is distinct from g.nature
union all select 'OT17 plusieurs OT ouverts pour la meme gamme', count(*) from (select gamme_id from ordres_travail where statut in ('planifie','en_cours','reouvert') and gamme_id is not null group by gamme_id having count(*) > 1) z
union all select 'OT18 cloture par un utilisateur inconnu', count(*) from ordres_travail o where o.closed_by is not null and not exists (select 1 from users u where u.id=o.closed_by)
union all select 'OT19 snapshot libelle_periodicite derive (OT non cloture)', count(*) from ordres_travail o join gammes g on g.id=o.gamme_id join periodicites pe on pe.id=g.periodicite_id where o.statut in ('planifie','en_cours','reouvert') and (o.libelle_periodicite is distinct from pe.libelle or o.jours_periodicite is distinct from pe.jours_periodicite)

-- Operations d execution
union all select 'OP01 terminee sans date_execution', count(*) from operations_execution where statut='terminee' and date_execution is null
union all select 'OP02 date_execution posee hors execution', count(*) from operations_execution where statut in ('en_attente','annulee') and date_execution is not null
union all select 'OP03 date_execution dans le futur', count(*) from operations_execution where date_execution > now()
union all select 'OP04 mesure terminee sans valeur ni index', count(*) from operations_execution where statut='terminee' and type_operation='Mesure' and valeur_mesuree is null and index_pose is null
union all select 'OP05 seuil_minimum > seuil_maximum', count(*) from operations_execution where seuil_minimum is not null and seuil_maximum is not null and seuil_minimum > seuil_maximum
union all select 'OP06 est_conforme=true hors des seuils', count(*) from operations_execution where est_conforme is true and valeur_mesuree is not null and ((seuil_minimum is not null and valeur_mesuree < seuil_minimum) or (seuil_maximum is not null and valeur_mesuree > seuil_maximum))
union all select 'OP07 est_conforme=false dans les seuils', count(*) from operations_execution where est_conforme is false and valeur_mesuree is not null and (seuil_minimum is null or valeur_mesuree >= seuil_minimum) and (seuil_maximum is null or valeur_mesuree <= seuil_maximum)
union all select 'OP08 source_id orpheline (ni operations ni modele item)', count(*) from operations_execution e where not exists (select 1 from operations o where o.id=e.source_id) and not exists (select 1 from modeles_operations_items m where m.id=e.source_id)
union all select 'OP09 doublon (ordre_travail_id, source_id)', count(*) from (select ordre_travail_id, source_id from operations_execution group by 1,2 having count(*)>1) z
union all select 'OP10 doublon ordre dans un meme OT', count(*) from (select ordre_travail_id, ordre from operations_execution group by 1,2 having count(*)>1) z
union all select 'OP11 index_pose < index_depose', count(*) from operations_execution where index_pose is not null and index_depose is not null and index_pose < index_depose
union all select 'OP12 executee par un utilisateur inconnu', count(*) from operations_execution e where e.executed_by is not null and not exists (select 1 from users u where u.id=e.executed_by)
union all select 'OP13 valeur_mesuree negative sur unite cumulative', count(*) from operations_execution where unite_est_cumulatif is true and valeur_mesuree < 0
union all select 'OP14 operation rattachee a un OT d un autre site que sa gamme', count(*) from operations_execution e join ordres_travail o on o.id=e.ordre_travail_id join operations op on op.id=e.source_id join gammes g on g.id=op.gamme_id where g.site_id is not null and g.site_id is distinct from o.site_id

-- Demandes / travaux / evenements / investissements
union all select 'DI01 cloturee sans date_resolution', count(*) from demandes_intervention where statut_di_id=3 and date_resolution is null
union all select 'DI02 date_resolution posee hors cloture', count(*) from demandes_intervention where statut_di_id<>3 and date_resolution is not null
union all select 'DI03 date_resolution < date_constat', count(*) from demandes_intervention where date_resolution is not null and date_resolution < date_constat
union all select 'DI04 date_constat dans le futur', count(*) from demandes_intervention where date_constat > current_date
union all select 'TR01 termine sans date_fin', count(*) from interventions_travaux where statut_travaux_id=4 and date_fin is null
union all select 'TR02 date_fin posee hors terminaison', count(*) from interventions_travaux where statut_travaux_id<>4 and date_fin is not null
union all select 'TR03 date_fin < date_demande', count(*) from interventions_travaux where date_fin is not null and date_fin < date_demande
union all select 'TR04 date_demande dans le futur', count(*) from interventions_travaux where date_demande > current_date
union all select 'TR05 verrouille sans etre termine', count(*) from interventions_travaux where verrouille is true and statut_travaux_id<>4
union all select 'EV01 cloture sans date_cloture', count(*) from evenements where statut_evenement_id=4 and date_cloture is null
union all select 'EV02 date_cloture posee hors cloture', count(*) from evenements where statut_evenement_id<>4 and date_cloture is not null
union all select 'EV03 date_cloture < date_evenement', count(*) from evenements where date_cloture is not null and date_cloture < date_evenement
union all select 'EV04 date_evenement dans le futur', count(*) from evenements where date_evenement > current_date
union all select 'EV05 verrouille sans etre cloture', count(*) from evenements where verrouille is true and statut_evenement_id<>4
union all select 'EV06 cloture sans compte_rendu', count(*) from evenements where statut_evenement_id=4 and (compte_rendu is null or btrim(compte_rendu)='')
union all select 'IN01 cloture sans date_cloture', count(*) from investissements where statut_capex_id=7 and date_cloture is null
union all select 'IN02 montant negatif', count(*) from investissements where montant_demande<0 or montant_prevu<0 or depense_reelle<0
union all select 'IN03 depense reelle sur un statut amont', count(*) from investissements where depense_reelle is not null and statut_capex_id in (1,4,5)
union all select 'IN04 date_cloture < date_demande', count(*) from investissements where date_cloture is not null and date_cloture < date_demande
union all select 'IN05 refuse avec une depense reelle > 0', count(*) from investissements where statut_capex_id=4 and coalesce(depense_reelle,0)>0

-- Taches polymorphes
union all select 'TA01 tache travaux sans lieu ni equipement', count(*) from travaux_taches where local_id is null and equipement_id is null
union all select 'TA02 tache travaux avec lieu ET equipement', count(*) from travaux_taches where local_id is not null and equipement_id is not null
union all select 'TA03 lieu evenement sans local ni equipement', count(*) from evenements_lieux where local_id is null and equipement_id is null
union all select 'TA04 lieu evenement avec local ET equipement', count(*) from evenements_lieux where local_id is not null and equipement_id is not null
union all select 'TA05 tache realisee sans date_tache', count(*) from travaux_taches where statut='realise' and date_tache is null
union all select 'TA06 travaux termine avec une tache en attente', count(*) from interventions_travaux t where t.statut_travaux_id=4 and exists (select 1 from travaux_taches x where x.travaux_id=t.id and x.statut<>'realise')
union all select 'TA07 evenement cloture avec un lieu non realise', count(*) from evenements e where e.statut_evenement_id=4 and exists (select 1 from evenements_lieux x where x.evenement_id=e.id and x.statut<>'realise')
union all select 'TA08 libelle de tache travaux vide ou blanc', count(*) from travaux_taches where btrim(libelle)=''
union all select 'TA09 libelle de lieu evenement vide ou blanc', count(*) from evenements_lieux where btrim(libelle)=''

-- Gammes, operations, periodicites
union all select 'GA01 seuil_min > seuil_max (operations)', count(*) from operations where seuil_minimum is not null and seuil_maximum is not null and seuil_minimum > seuil_maximum
union all select 'GA02 seuil_min > seuil_max (modeles_operations_items)', count(*) from modeles_operations_items where seuil_minimum is not null and seuil_maximum is not null and seuil_minimum > seuil_maximum
union all select 'GA03 type Mesure sans aucun seuil (operations)', count(*) from operations where type_operation_id=4 and seuil_minimum is null and seuil_maximum is null
union all select 'GA04 seuils poses sur un type qui n en demande pas', count(*) from operations o join types_operations t on t.id=o.type_operation_id where t.necessite_seuils=false and (o.seuil_minimum is not null or o.seuil_maximum is not null)
union all select 'GA05 doublon d ordre dans une gamme', count(*) from (select gamme_id, ordre from operations group by 1,2 having count(*)>1) z
union all select 'GA06 gamme active sans aucune operation', count(*) from gammes g where g.est_active and not exists (select 1 from operations o where o.gamme_id=g.id)
union all select 'GA07 gamme active de site sans aucun equipement rattache', count(*) from gammes g where g.est_active and g.site_id is not null and not exists (select 1 from gammes_equipements x where x.gamme_id=g.id)
union all select 'GA08 periodicite jours <= 0', count(*) from periodicites where jours_periodicite <= 0
union all select 'GA09 tolerance > periodicite', count(*) from periodicites where tolerance_jours > jours_periodicite
union all select 'GA10 gamme de SITE liee a une categorie COMMUNE', count(*) from gammes g join categories c on c.id=g.categorie_id where g.site_id is not null and c.site_id is null
union all select 'GA11 gamme COMMUNE liee a une categorie de SITE', count(*) from gammes g join categories c on c.id=g.categorie_id where g.site_id is null and c.site_id is not null
union all select 'GA12 gamme_modeles hors perimetre [garde-fou 113]', count(*) from gamme_modeles gm join gammes g on g.id=gm.gamme_id join modeles_operations m on m.id=gm.modele_operation_id where g.site_id is distinct from m.site_id
union all select 'GA13 categorie de parc pointant un modele hors site', count(*) from categories c join modeles_equipements m on m.id=c.modele_equipement_id where c.site_id is distinct from m.site_id
union all select 'GA14 OT ouvert avec un prestataire different de sa gamme', count(*) from ordres_travail o join gammes g on g.id=o.gamme_id where g.prestataire_id is not null and o.prestataire_id is distinct from g.prestataire_id and o.statut in ('planifie','en_cours','reouvert')
union all select 'GA15 gamme sans equipement mais avec des OT', count(*) from gammes g where not exists (select 1 from gammes_equipements x where x.gamme_id=g.id) and exists (select 1 from ordres_travail o where o.gamme_id=g.id)

-- Documents et miniatures
union all select 'DO01 document sans aucune liaison', count(*) from documents d where not exists (select 1 from documents_contrats x where x.document_id=d.id) and not exists (select 1 from documents_di x where x.document_id=d.id) and not exists (select 1 from documents_equipements x where x.document_id=d.id) and not exists (select 1 from documents_evenements x where x.document_id=d.id) and not exists (select 1 from documents_gammes x where x.document_id=d.id) and not exists (select 1 from documents_interventions_travaux x where x.document_id=d.id) and not exists (select 1 from documents_investissements x where x.document_id=d.id) and not exists (select 1 from documents_locaux x where x.document_id=d.id) and not exists (select 1 from documents_ordres_travail x where x.document_id=d.id) and not exists (select 1 from documents_prestataires x where x.document_id=d.id)
union all select 'DO02 taille_octets <= 0', count(*) from documents where taille_octets <= 0
union all select 'DO03 mime_type hors PDF/WebP', count(*) from documents where mime_type not in ('application/pdf','image/webp')
union all select 'DO04 hash_sha256 mal forme', count(*) from documents where hash_sha256 !~ '^[0-9a-f]{64}$'
union all select 'DO05 meme hash, storage_path different', count(*) from (select hash_sha256 from documents group by 1 having count(distinct storage_path)>1) z
union all select 'DO06 storage_path en doublon sur documents distincts', count(*) from (select storage_path from documents group by 1 having count(*)>1) z
union all select 'DO07 document sans site_id', count(*) from documents where site_id is null
union all select 'DO08 miniature orpheline', count(*) from miniatures m where not exists (select 1 from batiments x where x.miniature_id=m.id) and not exists (select 1 from niveaux x where x.miniature_id=m.id) and not exists (select 1 from locaux x where x.miniature_id=m.id) and not exists (select 1 from equipements x where x.miniature_id=m.id) and not exists (select 1 from gammes x where x.miniature_id=m.id) and not exists (select 1 from categories x where x.miniature_id=m.id) and not exists (select 1 from prestataires x where x.miniature_id=m.id) and not exists (select 1 from modeles_equipements x where x.miniature_id=m.id) and not exists (select 1 from modeles_operations x where x.miniature_id=m.id) and not exists (select 1 from modeles_di x where x.miniature_id=m.id) and not exists (select 1 from ordres_travail x where x.miniature_id=m.id)
union all select 'DO09 miniature hash mal forme', count(*) from miniatures where hash_sha256 !~ '^[0-9a-f]{64}$'
union all select 'DO10 storage_path avec traversee de chemin', count(*) from documents where storage_path like '%..%' or storage_path like '/%'
union all select 'DO11 nom_original vide', count(*) from documents where btrim(nom_original)=''

-- Lieux et equipements
union all select 'LI01 surface_m2 <= 0', count(*) from locaux where surface_m2 <= 0
union all select 'LI02 hauteur_m <= 0', count(*) from locaux where hauteur_m <= 0
union all select 'LI03 capacite_personnes < 0', count(*) from locaux where capacite_personnes < 0
union all select 'LI04 code_inventaire en doublon', count(*) from (select code_inventaire from equipements where code_inventaire is not null and btrim(code_inventaire)<>'' group by 1 having count(*)>1) z
union all select 'LI05 date_fin_garantie < date_mise_en_service', count(*) from equipements where date_fin_garantie is not null and date_mise_en_service is not null and date_fin_garantie < date_mise_en_service
union all select 'LI06 date_mise_en_service dans le futur', count(*) from equipements where date_mise_en_service > current_date
union all select 'LI07 equipement sans categorie', count(*) from equipements where categorie_id is null
union all select 'LI08 nom de local en doublon dans un meme niveau', count(*) from (select niveau_id, lower(btrim(nom)) from locaux group by 1,2 having count(*)>1) z
union all select 'LI09 nom de batiment en doublon dans un meme site', count(*) from (select site_id, lower(btrim(nom)) from batiments group by 1,2 having count(*)>1) z
union all select 'LI10 nom de niveau en doublon dans un meme batiment', count(*) from (select batiment_id, lower(btrim(nom)) from niveaux group by 1,2 having count(*)>1) z
union all select 'LI11 nom de gamme en doublon dans un meme perimetre', count(*) from (select coalesce(site_id::text,'commun'), lower(btrim(nom)) from gammes group by 1,2 having count(*)>1) z
union all select 'LI12 nom de local vide ou blanc', count(*) from locaux where btrim(nom)=''
union all select 'LI13 equipement dont la categorie n est pas de scope parc', count(*) from equipements e join categories c on c.id=e.categorie_id where c.scope <> 'parc'
union all select 'LI14 specifications non objet JSON', count(*) from equipements where jsonb_typeof(specifications) <> 'object'

-- Contrats
union all select 'CO01 date_fin < date_debut', count(*) from contrats where date_fin is not null and date_fin < date_debut
union all select 'CO02 date_resiliation < date_debut', count(*) from contrats where date_resiliation is not null and date_resiliation < date_debut
union all select 'CO03 date_signature > date_debut', count(*) from contrats where date_signature is not null and date_signature > date_debut
union all select 'CO04 delai_preavis_jours < 0', count(*) from contrats where delai_preavis_jours < 0
union all select 'CO05 duree_cycle_mois <= 0', count(*) from contrats where duree_cycle_mois <= 0
union all select 'CO06 avenant sans objet_avenant', count(*) from contrats where contrat_parent_id is not null and (objet_avenant is null or btrim(objet_avenant)='')
union all select 'CO07 avenant d un autre site que son parent', count(*) from contrats c join contrats p on p.id=c.contrat_parent_id where c.site_id is distinct from p.site_id
union all select 'CO08 avenant d un autre prestataire que son parent', count(*) from contrats c join contrats p on p.id=c.contrat_parent_id where c.prestataire_id is distinct from p.prestataire_id
union all select 'CO09 reference de contrat en doublon sur un site', count(*) from (select site_id, lower(btrim(reference)) from contrats group by 1,2 having count(*)>1) z
union all select 'CO10 non archive mais resilie depuis plus d un an', count(*) from contrats where est_archive=false and date_resiliation is not null and date_resiliation < current_date - interval '1 year'
union all select 'CO11 contrats_gammes hors site', count(*) from contrats_gammes cg join contrats c on c.id=cg.contrat_id join gammes g on g.id=cg.gamme_id where g.site_id is not null and g.site_id is distinct from c.site_id
union all select 'CO12 date_notification apres date_resiliation', count(*) from contrats where date_notification is not null and date_resiliation is not null and date_notification > date_resiliation
union all select 'CO13 prestataire du contrat non rattache au site du contrat', count(*) from contrats c where not exists (select 1 from prestataires_sites ps where ps.prestataire_id=c.prestataire_id and ps.site_id=c.site_id) and not exists (select 1 from prestataires p where p.id=c.prestataire_id and p.site_id=c.site_id)

-- Utilisateurs et habilitations
union all select 'US01 utilisateur actif non admin sans aucun site', count(*) from users u where u.est_actif and u.role_id<>1 and not exists (select 1 from user_sites s where s.user_id=u.id)
union all select 'US02 utilisateur sans compte auth', count(*) from users u where not exists (select 1 from auth.users a where a.id=u.id)
union all select 'US03 compte auth sans profil applicatif', count(*) from auth.users a where not exists (select 1 from users u where u.id=a.id)
union all select 'US04 anonymise mais encore actif', count(*) from users where anonymized_at is not null and est_actif
union all select 'US05 nom_complet vide', count(*) from users where btrim(nom_complet)=''
union all select 'US06 user_sites pointant un utilisateur inconnu', count(*) from user_sites s where not exists (select 1 from users u where u.id=s.user_id)
union all select 'US07 email auth non confirme mais utilisateur actif', count(*) from auth.users a join users u on u.id=a.id where u.est_actif and a.email_confirmed_at is null
union all select 'US08 colonnes de token auth a NULL (login 500 GoTrue)', count(*) from auth.users where confirmation_token is null or recovery_token is null or email_change_token_new is null or email_change is null
union all select 'US09 aucun administrateur actif', count(*) from (select 1 where not exists (select 1 from users where role_id=1 and est_actif)) z

-- Cloisonnement des donnees par site
union all select 'SI01 DI liee a un equipement d un autre site', count(*) from di_equipements x join demandes_intervention d on d.id=x.di_id join equipements e on e.id=x.equipement_id join locaux l on l.id=e.local_id join niveaux n on n.id=l.niveau_id join batiments b on b.id=n.batiment_id where b.site_id is distinct from d.site_id
union all select 'SI02 DI liee a un local d un autre site', count(*) from di_localisations x join demandes_intervention d on d.id=x.di_id join locaux l on l.id=x.local_id join niveaux n on n.id=l.niveau_id join batiments b on b.id=n.batiment_id where b.site_id is distinct from d.site_id
union all select 'SI03 tache travaux sur un local d un autre site', count(*) from travaux_taches x join interventions_travaux t on t.id=x.travaux_id join locaux l on l.id=x.local_id join niveaux n on n.id=l.niveau_id join batiments b on b.id=n.batiment_id where b.site_id is distinct from t.site_id
union all select 'SI04 lieu evenement sur un local d un autre site', count(*) from evenements_lieux x join evenements ev on ev.id=x.evenement_id join locaux l on l.id=x.local_id join niveaux n on n.id=l.niveau_id join batiments b on b.id=n.batiment_id where b.site_id is distinct from ev.site_id
union all select 'SI05 gamme liee a un equipement d un autre site', count(*) from gammes_equipements x join gammes g on g.id=x.gamme_id join equipements e on e.id=x.equipement_id join locaux l on l.id=e.local_id join niveaux n on n.id=l.niveau_id join batiments b on b.id=n.batiment_id where g.site_id is not null and b.site_id is distinct from g.site_id
union all select 'SI06 OT sur une gamme d un autre site', count(*) from ordres_travail o join gammes g on g.id=o.gamme_id where g.site_id is not null and g.site_id is distinct from o.site_id
union all select 'SI07 document lie a un OT d un autre site', count(*) from documents_ordres_travail x join documents d on d.id=x.document_id join ordres_travail o on o.id=x.ordre_travail_id where d.site_id is not null and d.site_id is distinct from o.site_id
union all select 'SI08 document lie a un evenement d un autre site', count(*) from documents_evenements x join documents d on d.id=x.document_id join evenements ev on ev.id=x.evenement_id where d.site_id is not null and d.site_id is distinct from ev.site_id
union all select 'SI09 miniature d un autre site que le prestataire', count(*) from prestataires p join miniatures m on m.id=p.miniature_id where m.site_id is not null and p.site_id is not null and m.site_id is distinct from p.site_id
union all select 'SI10 categorie enfant d un parent d un autre perimetre', count(*) from categories c join categories p on p.id=c.parent_id where c.site_id is distinct from p.site_id
union all select 'SI11 categorie enfant de scope different du parent', count(*) from categories c join categories p on p.id=c.parent_id where c.scope is distinct from p.scope
union all select 'SI12 modele d equipement hors perimetre de sa categorie', count(*) from modeles_equipements m join categories c on c.id=m.categorie_id where m.site_id is distinct from c.site_id
union all select 'SI13 equipement dont la categorie est d un autre site', count(*) from equipements e join categories c on c.id=e.categorie_id join locaux l on l.id=e.local_id join niveaux n on n.id=l.niveau_id join batiments b on b.id=n.batiment_id where c.site_id is not null and c.site_id is distinct from b.site_id
union all select 'SI14 document lie a un equipement d un autre site', count(*) from documents_equipements x join documents d on d.id=x.document_id join equipements e on e.id=x.equipement_id join locaux l on l.id=e.local_id join niveaux n on n.id=l.niveau_id join batiments b on b.id=n.batiment_id where d.site_id is not null and d.site_id is distinct from b.site_id

-- Cycles et auto-references
union all select 'HI01 categorie parente d elle-meme', count(*) from categories where parent_id=id
union all select 'HI02 contrat parent de lui-meme', count(*) from contrats where contrat_parent_id=id
union all select 'HI03 chapitre parent de lui-meme', count(*) from document_chapitres where parent_id=id
union all select 'HI04 copie_depuis_id pointant sur soi (categories)', count(*) from categories where copie_depuis_id=id
union all select 'HI05 copie_depuis_id pointant sur soi (gammes)', count(*) from gammes where copie_depuis_id=id
union all select 'HI06 avenant a deux niveaux', count(*) from contrats c join contrats p on p.id=c.contrat_parent_id where p.contrat_parent_id is not null
union all select 'HI07 categorie de niveau 3 ou plus', count(*) from categories c join categories p on p.id=c.parent_id join categories gp on gp.id=p.parent_id where gp.parent_id is not null

)
select i as invariant, n as lignes from v where n > 0 order by 1;
