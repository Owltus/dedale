export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          after: Json | null
          at: string
          before: Json | null
          id: number
          row_pk: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          at?: string
          before?: Json | null
          id?: number
          row_pk: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          at?: string
          before?: Json | null
          id?: number
          row_pk?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      batiments: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_path: string | null
          miniature_id: string | null
          nom: string
          site_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_path?: string | null
          miniature_id?: string | null
          nom: string
          site_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_path?: string | null
          miniature_id?: string | null
          nom?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batiments_miniature_id_fkey"
            columns: ["miniature_id"]
            isOneToOne: false
            referencedRelation: "miniatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batiments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batiments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "batiments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
        ]
      }
      categories: {
        Row: {
          copie_depuis_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          est_actif: boolean
          id: string
          image_path: string | null
          miniature_id: string | null
          nom: string
          ordre: number
          parent_id: string | null
          scope: Database["public"]["Enums"]["categorie_scope"]
          site_id: string | null
          updated_at: string
        }
        Insert: {
          copie_depuis_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          est_actif?: boolean
          id?: string
          image_path?: string | null
          miniature_id?: string | null
          nom: string
          ordre?: number
          parent_id?: string | null
          scope?: Database["public"]["Enums"]["categorie_scope"]
          site_id?: string | null
          updated_at?: string
        }
        Update: {
          copie_depuis_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          est_actif?: boolean
          id?: string
          image_path?: string | null
          miniature_id?: string | null
          nom?: string
          ordre?: number
          parent_id?: string | null
          scope?: Database["public"]["Enums"]["categorie_scope"]
          site_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_copie_depuis_id_fkey"
            columns: ["copie_depuis_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_miniature_id_fkey"
            columns: ["miniature_id"]
            isOneToOne: false
            referencedRelation: "miniatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "categories_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
        ]
      }
      chantier_equipements: {
        Row: {
          chantier_id: string
          created_at: string
          equipement_id: string
        }
        Insert: {
          chantier_id: string
          created_at?: string
          equipement_id: string
        }
        Update: {
          chantier_id?: string
          created_at?: string
          equipement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chantier_equipements_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "interventions_chantier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chantier_equipements_equipement_id_fkey"
            columns: ["equipement_id"]
            isOneToOne: false
            referencedRelation: "equipements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chantier_equipements_equipement_id_fkey"
            columns: ["equipement_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["id"]
          },
        ]
      }
      chantier_localisations: {
        Row: {
          chantier_id: string
          created_at: string
          local_id: string
        }
        Insert: {
          chantier_id: string
          created_at?: string
          local_id: string
        }
        Update: {
          chantier_id?: string
          created_at?: string
          local_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chantier_localisations_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "interventions_chantier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chantier_localisations_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locaux"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chantier_localisations_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["local_id"]
          },
        ]
      }
      contrats: {
        Row: {
          commentaires: string | null
          contrat_parent_id: string | null
          created_at: string
          date_debut: string
          date_fin: string | null
          date_notification: string | null
          date_resiliation: string | null
          date_signature: string | null
          delai_preavis_jours: number
          duree_cycle_mois: number | null
          est_archive: boolean
          fenetre_resiliation_jours: number | null
          id: string
          objet_avenant: string | null
          prestataire_id: string
          reference: string
          site_id: string
          type_contrat_id: number
          updated_at: string
        }
        Insert: {
          commentaires?: string | null
          contrat_parent_id?: string | null
          created_at?: string
          date_debut: string
          date_fin?: string | null
          date_notification?: string | null
          date_resiliation?: string | null
          date_signature?: string | null
          delai_preavis_jours?: number
          duree_cycle_mois?: number | null
          est_archive?: boolean
          fenetre_resiliation_jours?: number | null
          id?: string
          objet_avenant?: string | null
          prestataire_id: string
          reference: string
          site_id: string
          type_contrat_id: number
          updated_at?: string
        }
        Update: {
          commentaires?: string | null
          contrat_parent_id?: string | null
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          date_notification?: string | null
          date_resiliation?: string | null
          date_signature?: string | null
          delai_preavis_jours?: number
          duree_cycle_mois?: number | null
          est_archive?: boolean
          fenetre_resiliation_jours?: number | null
          id?: string
          objet_avenant?: string | null
          prestataire_id?: string
          reference?: string
          site_id?: string
          type_contrat_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrats_contrat_parent_id_fkey"
            columns: ["contrat_parent_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrats_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrats_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrats_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "contrats_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "contrats_type_contrat_id_fkey"
            columns: ["type_contrat_id"]
            isOneToOne: false
            referencedRelation: "types_contrats"
            referencedColumns: ["id"]
          },
        ]
      }
      contrats_gammes: {
        Row: {
          commentaire: string | null
          contrat_id: string
          created_at: string
          gamme_id: string
        }
        Insert: {
          commentaire?: string | null
          contrat_id: string
          created_at?: string
          gamme_id: string
        }
        Update: {
          commentaire?: string | null
          contrat_id?: string
          created_at?: string
          gamme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrats_gammes_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrats_gammes_gamme_id_fkey"
            columns: ["gamme_id"]
            isOneToOne: false
            referencedRelation: "gammes"
            referencedColumns: ["id"]
          },
        ]
      }
      demandes_intervention: {
        Row: {
          constat: string
          created_at: string
          created_by: string
          date_constat: string
          date_resolution: string | null
          deleted_at: string | null
          description_resolution: string | null
          id: string
          prestataire_id: string | null
          resolved_by: string | null
          site_id: string
          statut_di_id: number
          updated_at: string
        }
        Insert: {
          constat: string
          created_at?: string
          created_by: string
          date_constat?: string
          date_resolution?: string | null
          deleted_at?: string | null
          description_resolution?: string | null
          id?: string
          prestataire_id?: string | null
          resolved_by?: string | null
          site_id: string
          statut_di_id?: number
          updated_at?: string
        }
        Update: {
          constat?: string
          created_at?: string
          created_by?: string
          date_constat?: string
          date_resolution?: string | null
          deleted_at?: string | null
          description_resolution?: string | null
          id?: string
          prestataire_id?: string | null
          resolved_by?: string | null
          site_id?: string
          statut_di_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demandes_intervention_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_intervention_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_intervention_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_intervention_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_intervention_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "demandes_intervention_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "demandes_intervention_statut_di_id_fkey"
            columns: ["statut_di_id"]
            isOneToOne: false
            referencedRelation: "statuts_di"
            referencedColumns: ["id"]
          },
        ]
      }
      di_equipements: {
        Row: {
          created_at: string
          di_id: string
          equipement_id: string
        }
        Insert: {
          created_at?: string
          di_id: string
          equipement_id: string
        }
        Update: {
          created_at?: string
          di_id?: string
          equipement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "di_equipements_di_id_fkey"
            columns: ["di_id"]
            isOneToOne: false
            referencedRelation: "demandes_intervention"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "di_equipements_equipement_id_fkey"
            columns: ["equipement_id"]
            isOneToOne: false
            referencedRelation: "equipements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "di_equipements_equipement_id_fkey"
            columns: ["equipement_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["id"]
          },
        ]
      }
      di_localisations: {
        Row: {
          created_at: string
          di_id: string
          local_id: string
        }
        Insert: {
          created_at?: string
          di_id: string
          local_id: string
        }
        Update: {
          created_at?: string
          di_id?: string
          local_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "di_localisations_di_id_fkey"
            columns: ["di_id"]
            isOneToOne: false
            referencedRelation: "demandes_intervention"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "di_localisations_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locaux"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "di_localisations_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["local_id"]
          },
        ]
      }
      document_chapitres: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          nom: string
          ordre: number
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          nom: string
          ordre?: number
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          nom?: string
          ordre?: number
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chapitres_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chapitres_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "document_chapitres"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          chapitre_id: string | null
          deleted_at: string | null
          hash_sha256: string
          id: string
          mime_type: string
          nom_original: string
          site_id: string | null
          storage_path: string
          taille_octets: number
          type_document_id: number
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          chapitre_id?: string | null
          deleted_at?: string | null
          hash_sha256: string
          id?: string
          mime_type: string
          nom_original: string
          site_id?: string | null
          storage_path: string
          taille_octets: number
          type_document_id: number
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          chapitre_id?: string | null
          deleted_at?: string | null
          hash_sha256?: string
          id?: string
          mime_type?: string
          nom_original?: string
          site_id?: string | null
          storage_path?: string
          taille_octets?: number
          type_document_id?: number
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_chapitre_id_fkey"
            columns: ["chapitre_id"]
            isOneToOne: false
            referencedRelation: "document_chapitres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "documents_type_document_id_fkey"
            columns: ["type_document_id"]
            isOneToOne: false
            referencedRelation: "types_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_contrats: {
        Row: {
          commentaire: string | null
          contrat_id: string
          created_at: string
          document_id: string
        }
        Insert: {
          commentaire?: string | null
          contrat_id: string
          created_at?: string
          document_id: string
        }
        Update: {
          commentaire?: string | null
          contrat_id?: string
          created_at?: string
          document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_contrats_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_contrats_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_di: {
        Row: {
          commentaire: string | null
          created_at: string
          di_id: string
          document_id: string
        }
        Insert: {
          commentaire?: string | null
          created_at?: string
          di_id: string
          document_id: string
        }
        Update: {
          commentaire?: string | null
          created_at?: string
          di_id?: string
          document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_di_di_id_fkey"
            columns: ["di_id"]
            isOneToOne: false
            referencedRelation: "demandes_intervention"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_di_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_equipements: {
        Row: {
          commentaire: string | null
          created_at: string
          document_id: string
          equipement_id: string
        }
        Insert: {
          commentaire?: string | null
          created_at?: string
          document_id: string
          equipement_id: string
        }
        Update: {
          commentaire?: string | null
          created_at?: string
          document_id?: string
          equipement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_equipements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_equipements_equipement_id_fkey"
            columns: ["equipement_id"]
            isOneToOne: false
            referencedRelation: "equipements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_equipements_equipement_id_fkey"
            columns: ["equipement_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_gammes: {
        Row: {
          commentaire: string | null
          created_at: string
          document_id: string
          gamme_id: string
        }
        Insert: {
          commentaire?: string | null
          created_at?: string
          document_id: string
          gamme_id: string
        }
        Update: {
          commentaire?: string | null
          created_at?: string
          document_id?: string
          gamme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_gammes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_gammes_gamme_id_fkey"
            columns: ["gamme_id"]
            isOneToOne: false
            referencedRelation: "gammes"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_interventions_chantier: {
        Row: {
          chantier_id: string
          commentaire: string | null
          created_at: string
          document_id: string
        }
        Insert: {
          chantier_id: string
          commentaire?: string | null
          created_at?: string
          document_id: string
        }
        Update: {
          chantier_id?: string
          commentaire?: string | null
          created_at?: string
          document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_interventions_chantier_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "interventions_chantier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_interventions_chantier_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_investissements: {
        Row: {
          commentaire: string | null
          created_at: string
          document_id: string
          investissement_id: string
        }
        Insert: {
          commentaire?: string | null
          created_at?: string
          document_id: string
          investissement_id: string
        }
        Update: {
          commentaire?: string | null
          created_at?: string
          document_id?: string
          investissement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_investissements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_investissements_investissement_id_fkey"
            columns: ["investissement_id"]
            isOneToOne: false
            referencedRelation: "investissements"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_locaux: {
        Row: {
          commentaire: string | null
          created_at: string
          document_id: string
          local_id: string
        }
        Insert: {
          commentaire?: string | null
          created_at?: string
          document_id: string
          local_id: string
        }
        Update: {
          commentaire?: string | null
          created_at?: string
          document_id?: string
          local_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_locaux_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_locaux_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locaux"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_locaux_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["local_id"]
          },
        ]
      }
      documents_ordres_travail: {
        Row: {
          commentaire: string | null
          created_at: string
          document_id: string
          ordre_travail_id: string
        }
        Insert: {
          commentaire?: string | null
          created_at?: string
          document_id: string
          ordre_travail_id: string
        }
        Update: {
          commentaire?: string | null
          created_at?: string
          document_id?: string
          ordre_travail_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_ordres_travail_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_ordres_travail_ordre_travail_id_fkey"
            columns: ["ordre_travail_id"]
            isOneToOne: false
            referencedRelation: "ordres_travail"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_prestataires: {
        Row: {
          commentaire: string | null
          created_at: string
          document_id: string
          prestataire_id: string
        }
        Insert: {
          commentaire?: string | null
          created_at?: string
          document_id: string
          prestataire_id: string
        }
        Update: {
          commentaire?: string | null
          created_at?: string
          document_id?: string
          prestataire_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_prestataires_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_prestataires_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
        ]
      }
      equipements: {
        Row: {
          categorie_id: string | null
          code_inventaire: string | null
          commentaires: string | null
          copie_depuis_modele_id: string | null
          created_at: string
          date_fin_garantie: string | null
          date_mise_en_service: string | null
          deleted_at: string | null
          id: string
          image_path: string | null
          local_id: string
          nom: string
          specifications: Json
          updated_at: string
        }
        Insert: {
          categorie_id?: string | null
          code_inventaire?: string | null
          commentaires?: string | null
          copie_depuis_modele_id?: string | null
          created_at?: string
          date_fin_garantie?: string | null
          date_mise_en_service?: string | null
          deleted_at?: string | null
          id?: string
          image_path?: string | null
          local_id: string
          nom: string
          specifications?: Json
          updated_at?: string
        }
        Update: {
          categorie_id?: string | null
          code_inventaire?: string | null
          commentaires?: string | null
          copie_depuis_modele_id?: string | null
          created_at?: string
          date_fin_garantie?: string | null
          date_mise_en_service?: string | null
          deleted_at?: string | null
          id?: string
          image_path?: string | null
          local_id?: string
          nom?: string
          specifications?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipements_categorie_id_fkey"
            columns: ["categorie_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipements_copie_depuis_modele_id_fkey"
            columns: ["copie_depuis_modele_id"]
            isOneToOne: false
            referencedRelation: "modeles_equipements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipements_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locaux"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipements_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["local_id"]
          },
        ]
      }
      gamme_modeles: {
        Row: {
          created_at: string
          gamme_id: string
          modele_operation_id: string
        }
        Insert: {
          created_at?: string
          gamme_id: string
          modele_operation_id: string
        }
        Update: {
          created_at?: string
          gamme_id?: string
          modele_operation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamme_modeles_gamme_id_fkey"
            columns: ["gamme_id"]
            isOneToOne: false
            referencedRelation: "gammes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamme_modeles_modele_operation_id_fkey"
            columns: ["modele_operation_id"]
            isOneToOne: false
            referencedRelation: "modeles_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      gammes: {
        Row: {
          categorie_id: string | null
          copie_depuis_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          est_active: boolean
          id: string
          image_path: string | null
          miniature_id: string | null
          nature: Database["public"]["Enums"]["gamme_nature"]
          nom: string
          periodicite_id: number
          prestataire_id: string
          site_id: string | null
          updated_at: string
        }
        Insert: {
          categorie_id?: string | null
          copie_depuis_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          est_active?: boolean
          id?: string
          image_path?: string | null
          miniature_id?: string | null
          nature: Database["public"]["Enums"]["gamme_nature"]
          nom: string
          periodicite_id: number
          prestataire_id: string
          site_id?: string | null
          updated_at?: string
        }
        Update: {
          categorie_id?: string | null
          copie_depuis_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          est_active?: boolean
          id?: string
          image_path?: string | null
          miniature_id?: string | null
          nature?: Database["public"]["Enums"]["gamme_nature"]
          nom?: string
          periodicite_id?: number
          prestataire_id?: string
          site_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gammes_categorie_id_fkey"
            columns: ["categorie_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gammes_copie_depuis_id_fkey"
            columns: ["copie_depuis_id"]
            isOneToOne: false
            referencedRelation: "gammes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gammes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gammes_miniature_id_fkey"
            columns: ["miniature_id"]
            isOneToOne: false
            referencedRelation: "miniatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gammes_periodicite_id_fkey"
            columns: ["periodicite_id"]
            isOneToOne: false
            referencedRelation: "periodicites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gammes_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gammes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gammes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "gammes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
        ]
      }
      gammes_equipements: {
        Row: {
          created_at: string
          equipement_id: string
          gamme_id: string
        }
        Insert: {
          created_at?: string
          equipement_id: string
          gamme_id: string
        }
        Update: {
          created_at?: string
          equipement_id?: string
          gamme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gammes_equipements_equipement_id_fkey"
            columns: ["equipement_id"]
            isOneToOne: false
            referencedRelation: "equipements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gammes_equipements_equipement_id_fkey"
            columns: ["equipement_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gammes_equipements_gamme_id_fkey"
            columns: ["gamme_id"]
            isOneToOne: false
            referencedRelation: "gammes"
            referencedColumns: ["id"]
          },
        ]
      }
      interventions_chantier: {
        Row: {
          cloture_by: string | null
          compte_rendu: string | null
          created_at: string
          created_by: string
          date_demande: string
          date_fin: string | null
          date_prevue: string | null
          deleted_at: string | null
          description: string | null
          id: string
          prestataire_id: string | null
          site_id: string
          statut_chantier_id: number
          titre: string
          updated_at: string
        }
        Insert: {
          cloture_by?: string | null
          compte_rendu?: string | null
          created_at?: string
          created_by: string
          date_demande?: string
          date_fin?: string | null
          date_prevue?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          prestataire_id?: string | null
          site_id: string
          statut_chantier_id?: number
          titre: string
          updated_at?: string
        }
        Update: {
          cloture_by?: string | null
          compte_rendu?: string | null
          created_at?: string
          created_by?: string
          date_demande?: string
          date_fin?: string | null
          date_prevue?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          prestataire_id?: string | null
          site_id?: string
          statut_chantier_id?: number
          titre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interventions_chantier_cloture_by_fkey"
            columns: ["cloture_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_chantier_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_chantier_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_chantier_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_chantier_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "interventions_chantier_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "interventions_chantier_statut_chantier_id_fkey"
            columns: ["statut_chantier_id"]
            isOneToOne: false
            referencedRelation: "statuts_chantier"
            referencedColumns: ["id"]
          },
        ]
      }
      investissements: {
        Row: {
          created_at: string
          created_by: string
          date_demande: string
          deleted_at: string | null
          depense_reelle: number | null
          description: string | null
          id: string
          libelle: string
          montant_demande: number | null
          montant_prevu: number | null
          site_id: string
          statut_capex_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          date_demande?: string
          deleted_at?: string | null
          depense_reelle?: number | null
          description?: string | null
          id?: string
          libelle: string
          montant_demande?: number | null
          montant_prevu?: number | null
          site_id: string
          statut_capex_id?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date_demande?: string
          deleted_at?: string | null
          depense_reelle?: number | null
          description?: string | null
          id?: string
          libelle?: string
          montant_demande?: number | null
          montant_prevu?: number | null
          site_id?: string
          statut_capex_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investissements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investissements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investissements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "investissements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "investissements_statut_capex_id_fkey"
            columns: ["statut_capex_id"]
            isOneToOne: false
            referencedRelation: "statuts_capex"
            referencedColumns: ["id"]
          },
        ]
      }
      locaux: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_path: string | null
          miniature_id: string | null
          niveau_id: string
          nom: string
          surface_m2: number | null
          type_local_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_path?: string | null
          miniature_id?: string | null
          niveau_id: string
          nom: string
          surface_m2?: number | null
          type_local_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_path?: string | null
          miniature_id?: string | null
          niveau_id?: string
          nom?: string
          surface_m2?: number | null
          type_local_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locaux_miniature_id_fkey"
            columns: ["miniature_id"]
            isOneToOne: false
            referencedRelation: "miniatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locaux_niveau_id_fkey"
            columns: ["niveau_id"]
            isOneToOne: false
            referencedRelation: "niveaux"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locaux_niveau_id_fkey"
            columns: ["niveau_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["niveau_id"]
          },
          {
            foreignKeyName: "locaux_niveau_id_fkey"
            columns: ["niveau_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["niveau_id"]
          },
          {
            foreignKeyName: "locaux_type_local_id_fkey"
            columns: ["type_local_id"]
            isOneToOne: false
            referencedRelation: "types_locaux"
            referencedColumns: ["id"]
          },
        ]
      }
      miniatures: {
        Row: {
          created_at: string
          created_by: string | null
          hash_sha256: string
          id: string
          site_id: string | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hash_sha256: string
          id?: string
          site_id?: string | null
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hash_sha256?: string
          id?: string
          site_id?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "miniatures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miniatures_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miniatures_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "miniatures_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
        ]
      }
      modeles_di: {
        Row: {
          constat_modele: string
          created_at: string
          created_by: string
          description: string | null
          est_actif: boolean
          id: string
          libelle: string
          site_id: string
          updated_at: string
        }
        Insert: {
          constat_modele: string
          created_at?: string
          created_by: string
          description?: string | null
          est_actif?: boolean
          id?: string
          libelle: string
          site_id: string
          updated_at?: string
        }
        Update: {
          constat_modele?: string
          created_at?: string
          created_by?: string
          description?: string | null
          est_actif?: boolean
          id?: string
          libelle?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modeles_di_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modeles_di_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modeles_di_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "modeles_di_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
        ]
      }
      modeles_equipements: {
        Row: {
          categorie_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          est_actif: boolean
          id: string
          image_path: string | null
          nom: string
          site_id: string | null
          specifications: Json
          updated_at: string
        }
        Insert: {
          categorie_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          est_actif?: boolean
          id?: string
          image_path?: string | null
          nom: string
          site_id?: string | null
          specifications?: Json
          updated_at?: string
        }
        Update: {
          categorie_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          est_actif?: boolean
          id?: string
          image_path?: string | null
          nom?: string
          site_id?: string | null
          specifications?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modeles_equipements_categorie_id_fkey"
            columns: ["categorie_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modeles_equipements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modeles_equipements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modeles_equipements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "modeles_equipements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
        ]
      }
      modeles_operations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          nom: string
          site_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          nom: string
          site_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          nom?: string
          site_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modeles_operations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modeles_operations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "modeles_operations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
        ]
      }
      modeles_operations_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          modele_operation_id: string
          nom: string
          ordre: number
          seuil_maximum: number | null
          seuil_minimum: number | null
          type_operation_id: number
          unite_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          modele_operation_id: string
          nom: string
          ordre?: number
          seuil_maximum?: number | null
          seuil_minimum?: number | null
          type_operation_id: number
          unite_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          modele_operation_id?: string
          nom?: string
          ordre?: number
          seuil_maximum?: number | null
          seuil_minimum?: number | null
          type_operation_id?: number
          unite_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modeles_operations_items_modele_operation_id_fkey"
            columns: ["modele_operation_id"]
            isOneToOne: false
            referencedRelation: "modeles_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modeles_operations_items_type_operation_id_fkey"
            columns: ["type_operation_id"]
            isOneToOne: false
            referencedRelation: "types_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modeles_operations_items_unite_id_fkey"
            columns: ["unite_id"]
            isOneToOne: false
            referencedRelation: "unites"
            referencedColumns: ["id"]
          },
        ]
      }
      niveaux: {
        Row: {
          batiment_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_path: string | null
          miniature_id: string | null
          nom: string
          ordre: number
          updated_at: string
        }
        Insert: {
          batiment_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_path?: string | null
          miniature_id?: string | null
          nom: string
          ordre?: number
          updated_at?: string
        }
        Update: {
          batiment_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_path?: string | null
          miniature_id?: string | null
          nom?: string
          ordre?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "niveaux_batiment_id_fkey"
            columns: ["batiment_id"]
            isOneToOne: false
            referencedRelation: "batiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "niveaux_batiment_id_fkey"
            columns: ["batiment_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["batiment_id"]
          },
          {
            foreignKeyName: "niveaux_batiment_id_fkey"
            columns: ["batiment_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["batiment_id"]
          },
          {
            foreignKeyName: "niveaux_miniature_id_fkey"
            columns: ["miniature_id"]
            isOneToOne: false
            referencedRelation: "miniatures"
            referencedColumns: ["id"]
          },
        ]
      }
      observations: {
        Row: {
          commentaire_levee: string | null
          created_at: string
          created_by: string
          date_levee: string | null
          description: string
          document_levee_id: string | null
          echeance: string | null
          equipement_id: string | null
          gravite: Database["public"]["Enums"]["observation_gravite"]
          id: string
          levee_by: string | null
          ot_id: string | null
          site_id: string
          source: Database["public"]["Enums"]["observation_source"]
          statut: Database["public"]["Enums"]["observation_statut"]
          updated_at: string
        }
        Insert: {
          commentaire_levee?: string | null
          created_at?: string
          created_by: string
          date_levee?: string | null
          description: string
          document_levee_id?: string | null
          echeance?: string | null
          equipement_id?: string | null
          gravite: Database["public"]["Enums"]["observation_gravite"]
          id?: string
          levee_by?: string | null
          ot_id?: string | null
          site_id: string
          source: Database["public"]["Enums"]["observation_source"]
          statut?: Database["public"]["Enums"]["observation_statut"]
          updated_at?: string
        }
        Update: {
          commentaire_levee?: string | null
          created_at?: string
          created_by?: string
          date_levee?: string | null
          description?: string
          document_levee_id?: string | null
          echeance?: string | null
          equipement_id?: string | null
          gravite?: Database["public"]["Enums"]["observation_gravite"]
          id?: string
          levee_by?: string | null
          ot_id?: string | null
          site_id?: string
          source?: Database["public"]["Enums"]["observation_source"]
          statut?: Database["public"]["Enums"]["observation_statut"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "observations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_document_levee_id_fkey"
            columns: ["document_levee_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_equipement_id_fkey"
            columns: ["equipement_id"]
            isOneToOne: false
            referencedRelation: "equipements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_equipement_id_fkey"
            columns: ["equipement_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_levee_by_fkey"
            columns: ["levee_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ordres_travail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "observations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
        ]
      }
      operations: {
        Row: {
          created_at: string
          description: string | null
          gamme_id: string
          id: string
          nom: string
          ordre: number
          seuil_maximum: number | null
          seuil_minimum: number | null
          type_operation_id: number
          unite_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          gamme_id: string
          id?: string
          nom: string
          ordre?: number
          seuil_maximum?: number | null
          seuil_minimum?: number | null
          type_operation_id: number
          unite_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          gamme_id?: string
          id?: string
          nom?: string
          ordre?: number
          seuil_maximum?: number | null
          seuil_minimum?: number | null
          type_operation_id?: number
          unite_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_gamme_id_fkey"
            columns: ["gamme_id"]
            isOneToOne: false
            referencedRelation: "gammes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_type_operation_id_fkey"
            columns: ["type_operation_id"]
            isOneToOne: false
            referencedRelation: "types_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_unite_id_fkey"
            columns: ["unite_id"]
            isOneToOne: false
            referencedRelation: "unites"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_execution: {
        Row: {
          commentaires: string | null
          created_at: string
          date_execution: string | null
          description: string | null
          est_conforme: boolean | null
          executed_by: string | null
          id: string
          nom: string
          ordre: number
          ordre_travail_id: string
          seuil_maximum: number | null
          seuil_minimum: number | null
          source_id: string
          source_type: number
          statut: string
          type_operation: string
          unite_nom: string | null
          unite_symbole: string | null
          updated_at: string
          valeur_mesuree: number | null
        }
        Insert: {
          commentaires?: string | null
          created_at?: string
          date_execution?: string | null
          description?: string | null
          est_conforme?: boolean | null
          executed_by?: string | null
          id?: string
          nom: string
          ordre?: number
          ordre_travail_id: string
          seuil_maximum?: number | null
          seuil_minimum?: number | null
          source_id: string
          source_type: number
          statut?: string
          type_operation: string
          unite_nom?: string | null
          unite_symbole?: string | null
          updated_at?: string
          valeur_mesuree?: number | null
        }
        Update: {
          commentaires?: string | null
          created_at?: string
          date_execution?: string | null
          description?: string | null
          est_conforme?: boolean | null
          executed_by?: string | null
          id?: string
          nom?: string
          ordre?: number
          ordre_travail_id?: string
          seuil_maximum?: number | null
          seuil_minimum?: number | null
          source_id?: string
          source_type?: number
          statut?: string
          type_operation?: string
          unite_nom?: string | null
          unite_symbole?: string | null
          updated_at?: string
          valeur_mesuree?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_execution_executed_by_fkey"
            columns: ["executed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_execution_ordre_travail_id_fkey"
            columns: ["ordre_travail_id"]
            isOneToOne: false
            referencedRelation: "ordres_travail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_execution_statut_fkey"
            columns: ["statut"]
            isOneToOne: false
            referencedRelation: "statuts_operations"
            referencedColumns: ["code"]
          },
        ]
      }
      ordres_travail: {
        Row: {
          closed_by: string | null
          commentaires: string | null
          created_at: string
          created_by: string
          date_cloture: string | null
          date_debut: string | null
          date_prevue: string
          deleted_at: string | null
          description_gamme: string | null
          gamme_id: string | null
          id: string
          image_path: string | null
          jours_periodicite: number
          libelle_periodicite: string
          motif_annulation: string | null
          motif_reouverture: string | null
          nature_gamme: Database["public"]["Enums"]["gamme_nature"]
          nom_categorie: string | null
          nom_equipement: string | null
          nom_gamme: string
          nom_localisation: string | null
          nom_prestataire: string
          origine: Database["public"]["Enums"]["ot_origine"]
          prestataire_id: string
          site_id: string
          statut: string
          tolerance_jours: number
          updated_at: string
        }
        Insert: {
          closed_by?: string | null
          commentaires?: string | null
          created_at?: string
          created_by: string
          date_cloture?: string | null
          date_debut?: string | null
          date_prevue: string
          deleted_at?: string | null
          description_gamme?: string | null
          gamme_id?: string | null
          id?: string
          image_path?: string | null
          jours_periodicite?: number
          libelle_periodicite: string
          motif_annulation?: string | null
          motif_reouverture?: string | null
          nature_gamme: Database["public"]["Enums"]["gamme_nature"]
          nom_categorie?: string | null
          nom_equipement?: string | null
          nom_gamme: string
          nom_localisation?: string | null
          nom_prestataire: string
          origine: Database["public"]["Enums"]["ot_origine"]
          prestataire_id: string
          site_id: string
          statut?: string
          tolerance_jours?: number
          updated_at?: string
        }
        Update: {
          closed_by?: string | null
          commentaires?: string | null
          created_at?: string
          created_by?: string
          date_cloture?: string | null
          date_debut?: string | null
          date_prevue?: string
          deleted_at?: string | null
          description_gamme?: string | null
          gamme_id?: string | null
          id?: string
          image_path?: string | null
          jours_periodicite?: number
          libelle_periodicite?: string
          motif_annulation?: string | null
          motif_reouverture?: string | null
          nature_gamme?: Database["public"]["Enums"]["gamme_nature"]
          nom_categorie?: string | null
          nom_equipement?: string | null
          nom_gamme?: string
          nom_localisation?: string | null
          nom_prestataire?: string
          origine?: Database["public"]["Enums"]["ot_origine"]
          prestataire_id?: string
          site_id?: string
          statut?: string
          tolerance_jours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordres_travail_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordres_travail_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordres_travail_gamme_id_fkey"
            columns: ["gamme_id"]
            isOneToOne: false
            referencedRelation: "gammes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordres_travail_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordres_travail_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordres_travail_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "ordres_travail_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "ordres_travail_statut_fkey"
            columns: ["statut"]
            isOneToOne: false
            referencedRelation: "statuts_ot"
            referencedColumns: ["code"]
          },
        ]
      }
      periodicites: {
        Row: {
          description: string | null
          id: number
          jours_periodicite: number
          jours_valide: number
          libelle: string
          tolerance_jours: number
        }
        Insert: {
          description?: string | null
          id: number
          jours_periodicite: number
          jours_valide: number
          libelle: string
          tolerance_jours: number
        }
        Update: {
          description?: string | null
          id?: number
          jours_periodicite?: number
          jours_valide?: number
          libelle?: string
          tolerance_jours?: number
        }
        Relationships: []
      }
      prestataires: {
        Row: {
          adresse: string | null
          code_postal: string | null
          commentaires: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          est_interne: boolean
          id: string
          image_path: string | null
          libelle: string
          metier: string | null
          miniature_id: string | null
          siret: string | null
          site_id: string | null
          telephone: string | null
          updated_at: string
          ville: string | null
        }
        Insert: {
          adresse?: string | null
          code_postal?: string | null
          commentaires?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          est_interne?: boolean
          id?: string
          image_path?: string | null
          libelle: string
          metier?: string | null
          miniature_id?: string | null
          siret?: string | null
          site_id?: string | null
          telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Update: {
          adresse?: string | null
          code_postal?: string | null
          commentaires?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          est_interne?: boolean
          id?: string
          image_path?: string | null
          libelle?: string
          metier?: string | null
          miniature_id?: string | null
          siret?: string | null
          site_id?: string | null
          telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prestataires_miniature_id_fkey"
            columns: ["miniature_id"]
            isOneToOne: false
            referencedRelation: "miniatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestataires_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestataires_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "prestataires_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
        ]
      }
      prestataires_sites: {
        Row: {
          created_at: string
          prestataire_id: string
          site_id: string
        }
        Insert: {
          created_at?: string
          prestataire_id: string
          site_id: string
        }
        Update: {
          created_at?: string
          prestataire_id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prestataires_sites_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestataires_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestataires_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "prestataires_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          description: string | null
          id: number
        }
        Insert: {
          code: string
          description?: string | null
          id: number
        }
        Update: {
          code?: string
          description?: string | null
          id?: number
        }
        Relationships: []
      }
      security_alerts: {
        Row: {
          details: Json | null
          detected_at: string
          id: number
          indicator: string
          observed_value: number | null
          severity: string
          threshold: number | null
        }
        Insert: {
          details?: Json | null
          detected_at?: string
          id?: number
          indicator: string
          observed_value?: number | null
          severity: string
          threshold?: number | null
        }
        Update: {
          details?: Json | null
          detected_at?: string
          id?: number
          indicator?: string
          observed_value?: number | null
          severity?: string
          threshold?: number | null
        }
        Relationships: []
      }
      sites: {
        Row: {
          adresse: string | null
          code_postal: string | null
          created_at: string
          deleted_at: string | null
          id: string
          nom: string
          updated_at: string
          ville: string | null
        }
        Insert: {
          adresse?: string | null
          code_postal?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          nom: string
          updated_at?: string
          ville?: string | null
        }
        Update: {
          adresse?: string | null
          code_postal?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          nom?: string
          updated_at?: string
          ville?: string | null
        }
        Relationships: []
      }
      statuts_capex: {
        Row: {
          description: string | null
          id: number
          nom: string
        }
        Insert: {
          description?: string | null
          id: number
          nom: string
        }
        Update: {
          description?: string | null
          id?: number
          nom?: string
        }
        Relationships: []
      }
      statuts_chantier: {
        Row: {
          description: string | null
          id: number
          nom: string
        }
        Insert: {
          description?: string | null
          id: number
          nom: string
        }
        Update: {
          description?: string | null
          id?: number
          nom?: string
        }
        Relationships: []
      }
      statuts_di: {
        Row: {
          description: string | null
          id: number
          nom: string
        }
        Insert: {
          description?: string | null
          id: number
          nom: string
        }
        Update: {
          description?: string | null
          id?: number
          nom?: string
        }
        Relationships: []
      }
      statuts_operations: {
        Row: {
          code: string
          description: string | null
          id: number
          libelle: string
        }
        Insert: {
          code: string
          description?: string | null
          id: number
          libelle: string
        }
        Update: {
          code?: string
          description?: string | null
          id?: number
          libelle?: string
        }
        Relationships: []
      }
      statuts_ot: {
        Row: {
          code: string
          description: string | null
          id: number
          libelle: string
        }
        Insert: {
          code: string
          description?: string | null
          id: number
          libelle: string
        }
        Update: {
          code?: string
          description?: string | null
          id?: number
          libelle?: string
        }
        Relationships: []
      }
      types_contrats: {
        Row: {
          description: string | null
          id: number
          libelle: string
        }
        Insert: {
          description?: string | null
          id: number
          libelle: string
        }
        Update: {
          description?: string | null
          id?: number
          libelle?: string
        }
        Relationships: []
      }
      types_documents: {
        Row: {
          description: string
          est_systeme: boolean
          id: number
          nom: string
        }
        Insert: {
          description: string
          est_systeme?: boolean
          id: number
          nom: string
        }
        Update: {
          description?: string
          est_systeme?: boolean
          id?: number
          nom?: string
        }
        Relationships: []
      }
      types_locaux: {
        Row: {
          actif: boolean
          description: string | null
          id: number
          libelle: string
        }
        Insert: {
          actif?: boolean
          description?: string | null
          id: number
          libelle: string
        }
        Update: {
          actif?: boolean
          description?: string | null
          id?: number
          libelle?: string
        }
        Relationships: []
      }
      types_operations: {
        Row: {
          description: string | null
          id: number
          libelle: string
          necessite_seuils: boolean
        }
        Insert: {
          description?: string | null
          id: number
          libelle: string
          necessite_seuils?: boolean
        }
        Update: {
          description?: string | null
          id?: number
          libelle?: string
          necessite_seuils?: boolean
        }
        Relationships: []
      }
      unites: {
        Row: {
          description: string | null
          id: number
          nom: string
          symbole: string
        }
        Insert: {
          description?: string | null
          id: number
          nom: string
          symbole: string
        }
        Update: {
          description?: string | null
          id?: number
          nom?: string
          symbole?: string
        }
        Relationships: []
      }
      user_sites: {
        Row: {
          created_at: string
          site_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          site_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          site_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "user_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "user_sites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          anonymized_at: string | null
          created_at: string
          created_by: string | null
          est_actif: boolean
          id: string
          nom_complet: string
          photo_path: string | null
          role_id: number
          telephone: string | null
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          created_at?: string
          created_by?: string | null
          est_actif?: boolean
          id: string
          nom_complet: string
          photo_path?: string | null
          role_id: number
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          created_at?: string
          created_by?: string | null
          est_actif?: boolean
          id?: string
          nom_complet?: string
          photo_path?: string | null
          role_id?: number
          telephone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_equipements_complet: {
        Row: {
          batiment_id: string | null
          batiment_nom: string | null
          categorie_id: string | null
          categorie_nom: string | null
          categorie_scope: Database["public"]["Enums"]["categorie_scope"] | null
          code_inventaire: string | null
          commentaires: string | null
          created_at: string | null
          date_fin_garantie: string | null
          date_mise_en_service: string | null
          deleted_at: string | null
          id: string | null
          image_path: string | null
          local_id: string | null
          local_nom: string | null
          localisation_complete: string | null
          localisation_courte: string | null
          niveau_id: string | null
          niveau_nom: string | null
          nom: string | null
          site_id: string | null
          site_nom: string | null
          specifications: Json | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipements_categorie_id_fkey"
            columns: ["categorie_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipements_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locaux"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipements_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["local_id"]
          },
        ]
      }
      v_locaux_chemin: {
        Row: {
          batiment_id: string | null
          batiment_nom: string | null
          chemin_complet: string | null
          chemin_court: string | null
          local_id: string | null
          local_nom: string | null
          niveau_id: string | null
          niveau_nom: string | null
          site_id: string | null
          site_nom: string | null
          type_local: string | null
          type_local_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "locaux_type_local_id_fkey"
            columns: ["type_local_id"]
            isOneToOne: false
            referencedRelation: "types_locaux"
            referencedColumns: ["id"]
          },
        ]
      }
      v_observations_dashboard: {
        Row: {
          nb_bloquantes: number | null
          nb_echeance_30j: number | null
          nb_en_cours: number | null
          nb_en_retard: number | null
          nb_levees_30j: number | null
          nb_majeures: number | null
          nb_mineures: number | null
          site_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "observations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_equipements_complet"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "observations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_locaux_chemin"
            referencedColumns: ["site_id"]
          },
        ]
      }
      v_registre_securite: {
        Row: {
          date_ligne: string | null
          echeance: string | null
          gravite: Database["public"]["Enums"]["observation_gravite"] | null
          intervenant: string | null
          objet: string | null
          ref_id: string | null
          site_id: string | null
          statut: Database["public"]["Enums"]["observation_statut"] | null
          type_ligne: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      anonymize_user: {
        Args: { p_user_id: string }
        Returns: {
          anonymized_at: string | null
          created_at: string
          created_by: string | null
          est_actif: boolean
          id: string
          nom_complet: string
          photo_path: string | null
          role_id: number
          telephone: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_access_equipement: {
        Args: { p_equipement_id: string }
        Returns: boolean
      }
      can_access_gamme: { Args: { p_gamme_id: string }; Returns: boolean }
      can_access_local: { Args: { p_local_id: string }; Returns: boolean }
      can_access_prestataire: {
        Args: { p_prestataire_id: string }
        Returns: boolean
      }
      cleanup_storage_orphans: { Args: never; Returns: undefined }
      copier_gamme: {
        Args: { p_site_cible: string; p_source_gamme_id: string }
        Returns: string
      }
      copier_modele_equipement: {
        Args: { p_site_cible: string; p_source_modele_id: string }
        Returns: string
      }
      count_document_refs: { Args: { p_document_id: string }; Returns: number }
      count_miniature_refs: {
        Args: { p_miniature_id: string }
        Returns: number
      }
      current_role: { Args: never; Returns: string }
      deactivate_inactive_users: { Args: never; Returns: undefined }
      detect_security_anomalies: { Args: never; Returns: undefined }
      generate_next_ot_for_gamme: {
        Args: {
          p_created_by: string
          p_date_cloture_precedent: string
          p_gamme_id: string
          p_site_id: string
        }
        Returns: string
      }
      generate_operations_execution: {
        Args: { p_ot_id: string }
        Returns: undefined
      }
      get_audit_log: {
        Args: { p_before?: string; p_limit?: number; p_table_name?: string }
        Returns: {
          action: string
          after: Json | null
          at: string
          before: Json | null
          id: number
          row_pk: string
          table_name: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "audit_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_audit_trail: {
        Args: { p_row_pk: string; p_table_name: string }
        Returns: {
          action: string
          after: Json
          at: string
          before: Json
          id: number
          user_id: string
        }[]
      }
      get_my_sites: {
        Args: never
        Returns: {
          adresse: string | null
          code_postal: string | null
          created_at: string
          deleted_at: string | null
          id: string
          nom: string
          updated_at: string
          ville: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "sites"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_security_alerts: {
        Args: { p_before?: string; p_limit?: number }
        Returns: {
          details: Json | null
          detected_at: string
          id: number
          indicator: string
          observed_value: number | null
          severity: string
          threshold: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "security_alerts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_telephone: { Args: { p_user_id: string }; Returns: string }
      has_site_access: { Args: { target_site_id: string }; Returns: boolean }
      instancier_equipement: {
        Args: {
          p_code_inventaire: string
          p_local_id: string
          p_modele_id: string
        }
        Returns: string
      }
      miniature_scope_ok: {
        Args: { p_miniature_id: string; p_target_site_id: string }
        Returns: boolean
      }
      purge_corbeille_90j: { Args: never; Returns: Json }
      reouvrir_ot: {
        Args: { p_motif: string; p_ot_id: string }
        Returns: {
          closed_by: string | null
          commentaires: string | null
          created_at: string
          created_by: string
          date_cloture: string | null
          date_debut: string | null
          date_prevue: string
          deleted_at: string | null
          description_gamme: string | null
          gamme_id: string | null
          id: string
          image_path: string | null
          jours_periodicite: number
          libelle_periodicite: string
          motif_annulation: string | null
          motif_reouverture: string | null
          nature_gamme: Database["public"]["Enums"]["gamme_nature"]
          nom_categorie: string | null
          nom_equipement: string | null
          nom_gamme: string
          nom_localisation: string | null
          nom_prestataire: string
          origine: Database["public"]["Enums"]["ot_origine"]
          prestataire_id: string
          site_id: string
          statut: string
          tolerance_jours: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ordres_travail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_prestataire_effectif: {
        Args: {
          p_date_prevue: string
          p_gamme_id: string
          p_prestataire_demande: string
        }
        Returns: string
      }
      resolve_prestataire_for_ot: {
        Args: { p_ot_id: string }
        Returns: undefined
      }
      shares_site_with: { Args: { target_user_id: string }; Returns: boolean }
      snapshot_ot_from_gamme: { Args: { p_ot_id: string }; Returns: undefined }
      storage_objet_modifiable: { Args: { p_name: string }; Returns: boolean }
      storage_objet_rattache: { Args: { p_name: string }; Returns: boolean }
    }
    Enums: {
      categorie_scope: "equipement" | "gamme" | "mixte"
      gamme_nature: "controle_reglementaire" | "maintenance_preventive"
      observation_gravite: "mineure" | "majeure" | "bloquante"
      observation_source:
        | "controle_reglementaire"
        | "commission_securite"
        | "inspection_interne"
      observation_statut: "en_cours" | "levee"
      ot_origine: "programme" | "planifie"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      categorie_scope: ["equipement", "gamme", "mixte"],
      gamme_nature: ["controle_reglementaire", "maintenance_preventive"],
      observation_gravite: ["mineure", "majeure", "bloquante"],
      observation_source: [
        "controle_reglementaire",
        "commission_securite",
        "inspection_interne",
      ],
      observation_statut: ["en_cours", "levee"],
      ot_origine: ["programme", "planifie"],
    },
  },
} as const
