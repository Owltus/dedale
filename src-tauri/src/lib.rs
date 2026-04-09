pub mod commands;
pub mod db;
pub mod models;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Résoudre le répertoire de données de l'application
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Impossible de résoudre le répertoire de données");

            // Initialiser la base de données
            let db_pool = db::init_database(app_data_dir.clone())
                .expect("Erreur fatale lors de l'initialisation de la base de données");

            // Synchroniser les documents disque ↔ base
            {
                let conn = db_pool.lock().expect("Impossible de verrouiller la DB pour la sync documents");
                let docs_dir = app_data_dir.join("documents");
                if let Err(e) = commands::documents::sync_documents(&conn, &docs_dir) {
                    eprintln!("Avertissement : sync documents échouée : {}", e);
                }
            }

            // Enregistrer le pool dans le state Tauri
            app.manage(db_pool);

            // Plugin log en mode debug uniquement
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::system::ping,
            commands::system::read_file_base64,
            // Référentiels — Lecture seule
            commands::referentiels::get_unites,
            commands::referentiels::get_periodicites,
            commands::referentiels::get_types_operations,
            commands::referentiels::get_types_documents,
            commands::referentiels::get_postes,
            // Référentiels — Modèles de DI
            commands::referentiels::get_modele_di,
            commands::referentiels::get_modeles_di,
            commands::referentiels::create_modele_di,
            commands::referentiels::update_modele_di,
            commands::referentiels::delete_modele_di,
            // Référentiels — Lecture seule
            commands::referentiels::get_types_erp,
            commands::referentiels::get_categories_erp,
            commands::referentiels::get_types_contrats,
            commands::referentiels::get_statuts_ot,
            commands::referentiels::get_statuts_di,
            commands::referentiels::get_priorites_ot,
            // Établissement
            commands::referentiels::get_etablissement,
            commands::referentiels::upsert_etablissement,
            // Images
            commands::images::get_images,
            commands::images::upload_image,
            commands::images::get_image,
            commands::images::delete_image,
            // Bâtiments
            commands::localisations::get_batiments,
            commands::localisations::get_batiment,
            commands::localisations::create_batiment,
            commands::localisations::update_batiment,
            commands::localisations::delete_batiment,
            // Niveaux
            commands::localisations::get_niveaux,
            commands::localisations::get_niveau,
            commands::localisations::create_niveau,
            commands::localisations::update_niveau,
            commands::localisations::delete_niveau,
            // Locaux
            commands::localisations::get_locaux,
            commands::localisations::get_local,
            commands::localisations::create_local,
            commands::localisations::update_local,
            commands::localisations::delete_local,
            // Arbre localisations (helper dropdowns)
            commands::localisations::get_localisations_tree,
            // Données liées à un local (page détail)
            commands::localisations::get_equipements_by_local,
            commands::localisations::get_equipements_by_local_and_famille,
            commands::localisations::get_locaux_ids_by_famille,
            commands::localisations::get_gammes_by_local,
            commands::localisations::get_ot_by_local,
            // Domaines techniques
            commands::equipements::get_domaines,
            commands::equipements::get_domaines_equip_list,
            commands::equipements::get_domaine,
            commands::equipements::create_domaine,
            commands::equipements::update_domaine,
            commands::equipements::delete_domaine,
            // Familles d'équipements
            commands::equipements::get_familles,
            commands::equipements::get_familles_equip_list,
            commands::equipements::get_famille,
            commands::equipements::create_famille,
            commands::equipements::update_famille,
            commands::equipements::delete_famille,
            // Équipements
            commands::equipements::get_equipements,
            commands::equipements::get_equipements_list,
            commands::equipements::get_equipement,
            commands::equipements::create_equipement,
            commands::equipements::update_equipement,
            commands::equipements::delete_equipement,
            commands::equipements::get_ot_by_equipement,
            // Techniciens
            commands::techniciens::get_techniciens,
            commands::techniciens::get_technicien,
            commands::techniciens::create_technicien,
            commands::techniciens::update_technicien,
            commands::techniciens::delete_technicien,
            commands::techniciens::get_ot_by_technicien,
            // Prestataires
            commands::prestataires::get_prestataires,
            commands::prestataires::get_prestataire,
            commands::prestataires::create_prestataire,
            commands::prestataires::update_prestataire,
            commands::prestataires::delete_prestataire,
            // Contrats
            commands::contrats::get_contrats,
            commands::contrats::get_contrat,
            commands::contrats::create_contrat,
            commands::contrats::update_contrat,
            commands::contrats::delete_contrat,
            commands::contrats::resilier_contrat,
            commands::contrats::create_avenant,
            commands::contrats::get_contrat_versions,
            commands::contrats::get_contrat_gammes,
            commands::contrats::link_contrat_gamme,
            commands::contrats::unlink_contrat_gamme,
            // Catégories de modèles
            commands::modeles_equipements::get_categories_modeles,
            commands::modeles_equipements::create_categorie_modele,
            commands::modeles_equipements::update_categorie_modele,
            commands::modeles_equipements::delete_categorie_modele,
            // Modèles d'équipement
            commands::modeles_equipements::get_modeles_equipements,
            commands::modeles_equipements::get_modele_equipement,
            commands::modeles_equipements::create_modele_equipement,
            commands::modeles_equipements::update_modele_equipement,
            commands::modeles_equipements::delete_modele_equipement,
            commands::modeles_equipements::get_champs_modele,
            commands::modeles_equipements::create_champ_modele,
            commands::modeles_equipements::update_champ_modele,
            commands::modeles_equipements::archive_champ_modele,
            commands::modeles_equipements::delete_champ_modele,
            commands::modeles_equipements::reorder_champs_modele,
            commands::modeles_equipements::get_valeurs_equipement,
            commands::modeles_equipements::save_valeurs_equipement,
            // Modèles d'opérations
            commands::modeles_operations::get_modeles_operations,
            commands::modeles_operations::get_modele_operation,
            commands::modeles_operations::create_modele_operation,
            commands::modeles_operations::update_modele_operation,
            commands::modeles_operations::delete_modele_operation,
            commands::modeles_operations::get_modele_operation_items,
            commands::modeles_operations::create_modele_operation_item,
            commands::modeles_operations::update_modele_operation_item,
            commands::modeles_operations::delete_modele_operation_item,
            // Domaines gammes
            commands::gammes::get_domaines_gammes,
            commands::gammes::get_domaines_gammes_list,
            commands::gammes::get_domaine_gamme,
            commands::gammes::create_domaine_gamme,
            commands::gammes::update_domaine_gamme,
            commands::gammes::delete_domaine_gamme,
            // Familles gammes
            commands::gammes::get_familles_gammes,
            commands::gammes::get_familles_gammes_list,
            commands::gammes::get_famille_gamme,
            commands::gammes::create_famille_gamme,
            commands::gammes::update_famille_gamme,
            commands::gammes::delete_famille_gamme,
            // Gammes
            commands::gammes::get_gammes,
            commands::gammes::get_gamme,
            commands::gammes::create_gamme,
            commands::gammes::update_gamme,
            commands::gammes::delete_gamme,
            commands::gammes::toggle_gamme_active,
            // Opérations
            commands::gammes::get_operations,
            commands::gammes::create_operation,
            commands::gammes::update_operation,
            commands::gammes::delete_operation,
            // Gamme-Modèles
            commands::gammes::get_gamme_modeles,
            commands::gammes::link_modele_operation,
            commands::gammes::unlink_modele_operation,
            // Liaison gammes ↔ équipements
            commands::gammes::get_gamme_equipements,
            commands::gammes::link_gamme_equipement,
            commands::gammes::link_gamme_equipements_batch,
            commands::gammes::unlink_gamme_equipement,
            commands::gammes::get_equipement_gammes,
            // Ordres de travail
            commands::ordres_travail::get_ordres_travail,
            commands::ordres_travail::get_ot_by_gamme,
            commands::ordres_travail::get_ot_by_famille,
            commands::ordres_travail::get_ot_by_ids,
            commands::ordres_travail::get_ordre_travail,
            commands::ordres_travail::create_ordre_travail,
            commands::ordres_travail::delete_ordre_travail,
            commands::ordres_travail::update_statut_ot,
            commands::ordres_travail::update_ordre_travail,
            commands::ordres_travail::update_operation_execution,
            commands::ordres_travail::bulk_terminer_operations,
            // Demandes d'intervention
            commands::demandes::get_demandes,
            commands::demandes::get_demande,
            commands::demandes::create_demande,
            commands::demandes::update_demande,
            commands::demandes::delete_demande,
            commands::demandes::resoudre_demande,
            commands::demandes::reouvrir_demande,
            commands::demandes::repasser_ouverte_demande,
            commands::demandes::create_demande_from_modele,
            commands::demandes::get_di_gammes,
            commands::demandes::link_di_gamme,
            commands::demandes::unlink_di_gamme,
            commands::demandes::get_di_localisations,
            commands::demandes::link_di_localisation,
            commands::demandes::unlink_di_localisation,
            commands::demandes::get_di_equipements,
            commands::demandes::link_di_equipement,
            commands::demandes::unlink_di_equipement,
            // Documents
            commands::documents::upload_document,
            commands::documents::get_documents,
            commands::documents::get_documents_for_entity,
            commands::documents::get_documents_prestataire_agregat,
            commands::documents::download_document,
            commands::documents::save_document_to,
            commands::documents::delete_document,
            commands::documents::update_document,
            commands::documents::replace_document_file,
            commands::documents::link_document_prestataire,
            commands::documents::unlink_document_prestataire,
            commands::documents::link_document_ordre_travail,
            commands::documents::unlink_document_ordre_travail,
            commands::documents::link_document_gamme,
            commands::documents::unlink_document_gamme,
            commands::documents::link_document_contrat,
            commands::documents::unlink_document_contrat,
            commands::documents::link_document_di,
            commands::documents::unlink_document_di,
            commands::documents::link_document_localisation,
            commands::documents::unlink_document_localisation,
            commands::documents::link_document_equipement,
            commands::documents::unlink_document_equipement,
            commands::documents::get_documents_equipement_agregat,
            commands::documents::link_document_technicien,
            commands::documents::unlink_document_technicien,
            // Dashboard
            commands::dashboard::get_dashboard_data,
            // Planning
            commands::planning::get_planning_mois,
            commands::planning::get_planning_semaine,
            commands::planning::get_planning_annee,
            // Recherche globale
            commands::recherche::recherche_globale,
            // Export
            commands::export::export_csv_ot,
            commands::export::export_csv_equipements,
            commands::export::export_csv_gammes,
            commands::export::get_export_ot,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au lancement de l'application");
}
