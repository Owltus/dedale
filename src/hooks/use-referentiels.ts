// Hooks TanStack Query pour toutes les opérations CRUD des référentiels
import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type {
  Unite,
  Periodicite,
  TypeOperation,
  TypeDocument,
  Poste,
  TypeErp,
  CategorieErp,
  Etablissement,
  StatutOt,
  StatutDi,
  PrioriteOt,
  ModeleDi,
  ModeleDiDetail,
  TypeContrat,
} from "@/lib/types/referentiels";

// ── Query Keys ──────────────────────────────────────────────────────────────
export const referentielKeys = {
  unites: ["unites"] as const,
  periodicites: ["periodicites"] as const,
  typesOperations: ["types_operations"] as const,
  typesDocuments: ["types_documents"] as const,
  postes: ["postes"] as const,
  modelesDi: ["modeles_di"] as const,
  modeleDi: (id: number) => ["modeles_di", id] as const,
  typesErp: ["types_erp"] as const,
  categoriesErp: ["categories_erp"] as const,
  typesContrats: ["types_contrats"] as const,
  statutsOt: ["statuts_ot"] as const,
  statutsDi: ["statuts_di"] as const,
  prioritesOt: ["priorites_ot"] as const,
  etablissement: ["etablissement"] as const,
};

// ── Unités ──────────────────────────────────────────────────────────────────
// Lecture de toutes les unités de mesure
export function useUnites() {
  return useInvokeQuery<Unite[]>("get_unites", undefined, {
    queryKey: referentielKeys.unites,
    staleTime: Infinity,
  });
}

// ── Périodicités ────────────────────────────────────────────────────────────
// Lecture de toutes les périodicités
export function usePeriodicites() {
  return useInvokeQuery<Periodicite[]>("get_periodicites", undefined, {
    queryKey: referentielKeys.periodicites,
    staleTime: Infinity,
  });
}

// Périodicités : lecture seule (données système, pas de CRUD frontend)

// ── Types d'opérations ─────────────────────────────────────────────────────
// Lecture de tous les types d'opérations
export function useTypesOperations() {
  return useInvokeQuery<TypeOperation[]>("get_types_operations", undefined, {
    queryKey: referentielKeys.typesOperations,
    staleTime: Infinity,
  });
}

// ── Types de documents ─────────────────────────────────────────────────────
// Lecture de tous les types de documents
export function useTypesDocuments() {
  return useInvokeQuery<TypeDocument[]>("get_types_documents", undefined, {
    queryKey: referentielKeys.typesDocuments,
    staleTime: Infinity,
  });
}

// ── Postes ──────────────────────────────────────────────────────────────────
// Lecture de tous les postes
export function usePostes() {
  return useInvokeQuery<Poste[]>("get_postes", undefined, {
    queryKey: referentielKeys.postes,
    staleTime: Infinity,
  });
}

// ── Modèles de DI ───────────────────────────────────────────────────────────
// Lecture de tous les modèles de demandes d'intervention
export function useModelesDi() {
  return useInvokeQuery<ModeleDi[]>("get_modeles_di", undefined, {
    queryKey: referentielKeys.modelesDi,
    staleTime: Infinity,
  });
}

// Lecture d'un modèle de DI par ID (avec libellé du type)
export function useModeleDi(id: number) {
  return useInvokeQuery<ModeleDiDetail>("get_modele_di", { id }, {
    queryKey: referentielKeys.modeleDi(id),
    enabled: !!id,
  });
}

// Création d'un modèle de DI
export function useCreateModeleDi() {
  const qc = useQueryClient();
  return useInvokeMutation<
    ModeleDi,
    {
      input: {
        nom_modele: string;
        description?: string;
        libelle_constat: string;
        description_constat: string;
        description_resolution?: string;
      };
    }
  >("create_modele_di", {
    onSettled: () =>
      qc.invalidateQueries({ queryKey: referentielKeys.modelesDi }),
  });
}

// Mise à jour d'un modèle de DI
export function useUpdateModeleDi() {
  const qc = useQueryClient();
  return useInvokeMutation<
    ModeleDi,
    {
      id: number;
      input: {
        nom_modele: string;
        description?: string;
        libelle_constat: string;
        description_constat: string;
        description_resolution?: string;
      };
    }
  >("update_modele_di", {
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: referentielKeys.modelesDi });
      qc.invalidateQueries({ queryKey: referentielKeys.modeleDi(vars.id) });
    },
  });
}

// Suppression d'un modèle de DI
export function useDeleteModeleDi() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>("delete_modele_di", {
    onSettled: () =>
      qc.invalidateQueries({ queryKey: referentielKeys.modelesDi }),
  });
}

// ── Types ERP (lecture seule) ───────────────────────────────────────────────
// Lecture de tous les types ERP — données statiques, ne changent jamais
export function useTypesErp() {
  return useInvokeQuery<TypeErp[]>("get_types_erp", undefined, {
    queryKey: referentielKeys.typesErp,
    staleTime: Infinity,
  });
}

// ── Catégories ERP (lecture seule) ──────────────────────────────────────────
// Lecture de toutes les catégories ERP — données statiques
export function useCategoriesErp() {
  return useInvokeQuery<CategorieErp[]>("get_categories_erp", undefined, {
    queryKey: referentielKeys.categoriesErp,
    staleTime: Infinity,
  });
}

// ── Types de contrats (lecture seule) ───────────────────────────────────────
// Lecture de tous les types de contrats — données statiques
export function useTypesContrats() {
  return useInvokeQuery<TypeContrat[]>("get_types_contrats", undefined, {
    queryKey: referentielKeys.typesContrats,
    staleTime: Infinity,
  });
}

// ── Statuts OT (lecture seule) ──────────────────────────────────────────────
// Lecture de tous les statuts d'ordres de travail — données statiques
export function useStatutsOt() {
  return useInvokeQuery<StatutOt[]>("get_statuts_ot", undefined, {
    queryKey: referentielKeys.statutsOt,
    staleTime: Infinity,
  });
}

// ── Statuts DI (lecture seule) ──────────────────────────────────────────────
// Lecture de tous les statuts de demandes d'intervention — données statiques
export function useStatutsDi() {
  return useInvokeQuery<StatutDi[]>("get_statuts_di", undefined, {
    queryKey: referentielKeys.statutsDi,
    staleTime: Infinity,
  });
}

// ── Priorités OT (lecture seule) ────────────────────────────────────────────
// Lecture de toutes les priorités d'ordres de travail — données statiques
export function usePrioritesOt() {
  return useInvokeQuery<PrioriteOt[]>("get_priorites_ot", undefined, {
    queryKey: referentielKeys.prioritesOt,
    staleTime: Infinity,
  });
}

// ── Établissement ───────────────────────────────────────────────────────────
// Lecture de l'établissement unique (peut être null si pas encore configuré)
export function useEtablissement() {
  return useInvokeQuery<Etablissement | null>(
    "get_etablissement",
    undefined,
    { queryKey: referentielKeys.etablissement, staleTime: Infinity }
  );
}

// Création ou mise à jour de l'établissement (upsert)
export function useUpsertEtablissement() {
  const qc = useQueryClient();
  return useInvokeMutation<
    Etablissement,
    {
      input: {
        nom: string;
        id_type_erp?: number | null;
        id_categorie_erp?: number | null;
        adresse?: string | null;
        code_postal?: string | null;
        ville?: string | null;
      };
    }
  >("upsert_etablissement", {
    onSettled: () =>
      qc.invalidateQueries({ queryKey: referentielKeys.etablissement }),
  });
}
