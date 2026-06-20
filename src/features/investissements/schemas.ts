import { z } from 'zod'

// Champ montant : texte numérique optionnel (≥ 0, max 2 décimales).
// Vide accepté → converti en null à l'enregistrement (cf. mutations).
const montant = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d+([.,]\d{1,2})?$/.test(v), {
    message: 'Montant invalide (positif, 2 décimales max)',
  })

export const investissementSchema = z.object({
  libelle: z.string().trim().min(1, 'Le libellé est obligatoire').max(200),
  description: z.string().trim().max(2000),
  montant_demande: montant,
  montant_prevu: montant,
  depense_reelle: montant,
  date_demande: z.string().min(1, 'La date de demande est obligatoire'),
})

export type InvestissementFormValues = z.infer<typeof investissementSchema>

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function emptyInvestissement(): InvestissementFormValues {
  return {
    libelle: '',
    description: '',
    montant_demande: '',
    montant_prevu: '',
    depense_reelle: '',
    date_demande: today(),
  }
}

/** Convertit un champ texte montant en number ≥ 0 ou null (vide). */
export function parseMontant(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  return Number(trimmed.replace(',', '.'))
}
