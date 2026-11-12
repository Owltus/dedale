import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { investissementsQueries } from './queries'
import {
  estConfirmeOuPlus,
  estPrevalideOuPlus,
  ID_REALISE,
  ID_REFUSE,
} from './etat'
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
    }: {
      id: string
      values: InvestissementFormValues
    }) => {
      const { data } = await supabase
        .from('investissements')
        .update(toPayload(values))
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
 * Passer à « Réalisé » pose la date, le bilan et l'auteur ; en repartir les
 * efface — sinon un dossier rouvert garderait une date de fin antérieure à son
 * propre suivi (`investissements_dates_coherentes`, migration 079). La date
 * est une date NUE (`isoLocale`), jamais un `toISOString()`.
 *
 * « Refusé » suit la même logique avec le trio motif / date / auteur : la base
 * EXIGE un motif, et en repartir l'efface.
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
      dateValidation,
      datePrevalidation,
      garderPrevalidation,
      report,
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
      /** Date de CONFIRMATION, saisie en confirmant (absent = inchangée). */
      dateValidation?: string
      /** Date de prévalidation, saisie en prévalidant (absent = inchangée). */
      datePrevalidation?: string
      /** Refus au 2e niveau : la prévalidation reste acquise (150). */
      garderPrevalidation?: boolean
      /**
       * Report (demande PO du 12/11/2026) : les dates d'accord restent en
       * place, masquées tant que le statut ne les montre pas, pour qu'annuler
       * le report les rende telles quelles.
       */
      report?: boolean
      /** Devis retenus, choisis en validant (147) ; absent = inchangés. */
      devisRetenus?: string[]
    }) => {
      // Le choix des devis d'abord : si le statut échoue ensuite, un devis
      // coché sans validation ne compte pas (montantProjet).
      if (devisRetenus !== undefined) await poserRetenus(id, devisRetenus)
      const realise = statutId === ID_REALISE
      const refus = statutId === ID_REFUSE
      // Chaque date d'accord survit aux étapes SUIVANTES, pas à un retour
      // en arrière ni à un refus (146, 150) : la prévalidation tient de
      // Prévalidé à Réalisé, la confirmation de Confirmé à Réalisé.
      const prevalideOuPlus =
        estPrevalideOuPlus(statutId) || (refus && garderPrevalidation === true)
      const confirmeOuPlus = estConfirmeOuPlus(statutId)
      const { data } = await supabase
        .from('investissements')
        .update({
          statut_capex_id: statutId,
          annee_budget: annee,
          bilan: realise ? (bilan?.trim() ?? '') || null : null,
          date_cloture: realise ? (dateCloture ?? null) : null,
          cloture_by: realise ? (clotureBy ?? null) : null,
          motif_arret: refus ? (motifArret?.trim() ?? '') || null : null,
          date_arret: refus ? (dateArret ?? null) : null,
          arrete_by: refus ? (arreteBy ?? null) : null,
          ...(report === true
            ? {}
            : !confirmeOuPlus
              ? { date_validation: null }
              : dateValidation !== undefined && {
                  date_validation: dateValidation,
                }),
          ...(report === true
            ? {}
            : !prevalideOuPlus
              ? { date_prevalidation: null }
              : datePrevalidation !== undefined && {
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
