import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { investissementsQueries } from './queries'
import { parseMontant } from './schemas'
import type { DevisFormValues, InvestissementFormValues } from './schemas'

// Convertit les champs texte du formulaire en payload base (vides → null). Le
// statut n'est plus saisi dans le formulaire : il vaut son DEFAULT (Demandé) à
// la création et se change ensuite par les boutons de la fiche (cf. useChangeStatutCapex).
function toPayload(v: InvestissementFormValues) {
  return {
    libelle: v.libelle.trim(),
    description: v.description.trim() || null,
    date_demande: v.date_demande,
    annee_budget: Number(v.annee_budget),
  }
}

export function useCreateInvestissement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      siteId,
      createdBy,
      values,
    }: {
      siteId: string
      createdBy: string
      values: InvestissementFormValues
    }) => {
      const { data } = await supabase
        .from('investissements')
        .insert({
          ...toPayload(values),
          site_id: siteId,
          created_by: createdBy,
        })
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}

export function useUpdateInvestissement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      oublierRealisation = false,
    }: {
      id: string
      values: InvestissementFormValues
      /**
       * Projet non réalisé dont la date de réalisation GARDÉE EN MÉMOIRE (152)
       * précéderait la nouvelle date de proposition : on l'oublie, sinon la
       * base refuse (`investissements_dates_coherentes`, 079).
       */
      oublierRealisation?: boolean
    }) => {
      const { data } = await supabase
        .from('investissements')
        .update({
          ...toPayload(values),
          ...(oublierRealisation && { date_cloture: null }),
        })
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}

/**
 * Change le statut d'un investissement, et son année de budget pour un report
 * (138). La base journalise l'un comme l'autre dans l'historique.
 *
 * MÉMOIRE (152, demande PO du 12/11/2026) : changer d'étape n'EFFACE plus
 * rien. Dates d'accord, refus (date, motif, niveau) et réalisation (date,
 * bilan) restent en base ; c'est le statut qui dit ce qui s'affiche. Revenir
 * sur une erreur rend donc tout tel quel, sans rien retaper. Seuls les champs
 * passés sont écrits. Les dates sont des dates NUES (`isoLocale`).
 */
export function useChangeStatutCapex() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      statutId,
      annee,
      bilan,
      dateCloture,
      clotureBy,
      motifArret,
      dateArret,
      arreteBy,
      refusNiveau,
      dateValidation,
      datePrevalidation,
      devisRetenus,
    }: {
      id: string
      statutId: number
      /** Année du budget après l'action (report = +1). */
      annee: number
      bilan?: string
      dateCloture?: string
      clotureBy?: string
      /** Motif du refus, facultatif depuis 145. */
      motifArret?: string
      dateArret?: string
      arreteBy?: string
      /** Niveau du refus (152) : 1 = prévalidation, 2 = confirmation. */
      refusNiveau?: 1 | 2
      /** Date de CONFIRMATION (absent = inchangée). */
      dateValidation?: string
      /** Date de prévalidation (absent = inchangée). */
      datePrevalidation?: string
      /** Devis retenus (147) ; absent = inchangés. */
      devisRetenus?: string[]
    }) => {
      // Le choix des devis d'abord : si le statut échoue ensuite, un devis
      // coché sans validation ne compte pas (montantProjet).
      if (devisRetenus !== undefined) await poserRetenus(id, devisRetenus)
      const { data } = await supabase
        .from('investissements')
        .update({
          statut_capex_id: statutId,
          annee_budget: annee,
          ...(bilan !== undefined && { bilan: bilan.trim() || null }),
          ...(dateCloture !== undefined && { date_cloture: dateCloture }),
          ...(clotureBy !== undefined && { cloture_by: clotureBy }),
          ...(motifArret !== undefined && {
            motif_arret: motifArret.trim() || null,
          }),
          ...(dateArret !== undefined && { date_arret: dateArret }),
          ...(arreteBy !== undefined && { arrete_by: arreteBy }),
          ...(refusNiveau !== undefined && { refus_niveau: refusNiveau }),
          ...(dateValidation !== undefined && {
            date_validation: dateValidation,
          }),
          ...(datePrevalidation !== undefined && {
            date_prevalidation: datePrevalidation,
          }),
        })
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}

export function useDeleteInvestissement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Suppression définitive (hard-delete).
      await supabase
        .from('investissements')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}

/**
 * Corrige la seule date d'un accord — prévalidation ou confirmation (menu du
 * clic droit sur sa case) — sans toucher au statut ni à la réalisation :
 * `useChangeStatutCapex` effacerait le bilan.
 */
/** Les deux niveaux d'accord d'un projet (150). */
export type NiveauAccord = 'prevalidation' | 'validation'

export function useModifierDateValidation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      niveau,
      date,
    }: {
      id: string
      niveau: NiveauAccord
      date: string
    }) => {
      await supabase
        .from('investissements')
        .update(
          niveau === 'prevalidation'
            ? { date_prevalidation: date }
            : { date_validation: date },
        )
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}

/** Coche exactement `retenus` parmi les devis du projet (147). */
async function poserRetenus(projetId: string, retenus: string[]) {
  await supabase
    .from('investissements_devis')
    .update({ retenu: false })
    .eq('investissement_id', projetId)
    .throwOnError()
  if (retenus.length > 0)
    await supabase
      .from('investissements_devis')
      .update({ retenu: true })
      .eq('investissement_id', projetId)
      .in('id', retenus)
      .throwOnError()
}

function devisPayload(v: DevisFormValues) {
  return {
    fournisseur: v.fournisseur.trim(),
    objet: v.objet.trim() || null,
    montant_ht: parseMontant(v.montant_ht) ?? 0,
  }
}

/** Ajoute un devis à un projet (147), avec son PDF s'il y en a un. */
export function useCreerDevis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projetId,
      values,
      documentId,
    }: {
      projetId: string
      values: DevisFormValues
      documentId: string | null
    }) => {
      await supabase
        .from('investissements_devis')
        .insert({
          ...devisPayload(values),
          investissement_id: projetId,
          document_id: documentId,
        })
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}

/** Modifie un devis ; `documentId` absent = PDF inchangé. */
export function useModifierDevis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      documentId,
    }: {
      id: string
      values: DevisFormValues
      documentId?: string | null
    }) => {
      await supabase
        .from('investissements_devis')
        .update({
          ...devisPayload(values),
          ...(documentId !== undefined && { document_id: documentId }),
        })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}

/** Retient ou non UN devis (menu du schéma). */
export function useRetenirDevis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, retenu }: { id: string; retenu: boolean }) => {
      await supabase
        .from('investissements_devis')
        .update({ retenu })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}

/** Supprime un devis ; son PDF reste dans les documents du projet. */
export function useSupprimerDevis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('investissements_devis')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: investissementsQueries.all() }),
  })
}
