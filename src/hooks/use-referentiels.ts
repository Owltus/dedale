// Hooks TanStack Query pour toutes les opérations CRUD des référentiels
import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type {
  Unite,
  Periodicite,
  TypeOperation,
  TypeDocument,
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
  modelesDi: ["modeles_di"] as const,
  modeleDi: (id: number) => ["modeles_di", id] as const,
  typesContrats: ["types_contrats"] as const,
  statutsOt: ["statuts_ot"] as const,
  statutsDi: ["statuts_di"] as const,
  prioritesOt: ["priorites_ot"] as const,
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

