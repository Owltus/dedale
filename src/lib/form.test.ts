import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  deleteErrorMessage,
  errorMessage,
  exportErrorMessage,
  fieldErrors,
  pgCode,
  writeErrorMessage,
} from './form'

/** Fabrique une erreur façon supabase-js (`{ code, message, details }`). */
function pgError(code: string, message = 'erreur technique brute', details = '') {
  return { code, message, details }
}

describe('pgCode', () => {
  it('extrait le code string d’une erreur type supabase-js', () => {
    expect(pgCode(pgError('42501'))).toBe('42501')
    expect(pgCode({ code: 'PGRST116' })).toBe('PGRST116')
  })

  it('renvoie undefined quand le code est absent ou non-string', () => {
    expect(pgCode({ message: 'sans code' })).toBeUndefined()
    expect(pgCode({ code: 500 })).toBeUndefined()
  })

  it('renvoie undefined pour null, undefined et primitives', () => {
    expect(pgCode(null)).toBeUndefined()
    expect(pgCode(undefined)).toBeUndefined()
    expect(pgCode('42501')).toBeUndefined()
    expect(pgCode(new Error('boum'))).toBeUndefined()
  })
})

describe('errorMessage', () => {
  it('renvoie le message d’une Error', () => {
    expect(errorMessage(new Error('quelque chose a cassé'))).toBe(
      'quelque chose a cassé',
    )
  })

  it('retombe sur le fallback par défaut pour une non-Error', () => {
    expect(errorMessage({ code: '42501' })).toBe('Une erreur est survenue')
    expect(errorMessage(null)).toBe('Une erreur est survenue')
  })

  it('accepte un fallback personnalisé', () => {
    expect(errorMessage('texte brut', 'Échec sur mesure')).toBe(
      'Échec sur mesure',
    )
  })
})

describe('fieldErrors', () => {
  it('map la première erreur par nom de champ depuis une ZodError', () => {
    const schema = z.object({
      nom: z.string().min(1, 'Le nom est requis'),
      email: z.email('Email invalide'),
    })
    const res = schema.safeParse({ nom: '', email: 'pas-un-email' })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(fieldErrors(res.error)).toEqual({
      nom: 'Le nom est requis',
      email: 'Email invalide',
    })
  })

  it('ne garde que la première erreur rencontrée par champ', () => {
    const schema = z.object({
      code: z
        .string()
        .min(3, 'Trop court')
        .regex(/^[A-Z]+$/, 'Majuscules seulement'),
    })
    const res = schema.safeParse({ code: 'a' })
    expect(res.success).toBe(false)
    if (res.success) return
    const errs = fieldErrors(res.error)
    expect(errs.code).toBe('Trop court')
  })

  it('ignore les issues dont le chemin ne commence pas par une string', () => {
    const schema = z.array(z.string())
    const res = schema.safeParse(['ok', 42])
    expect(res.success).toBe(false)
    if (res.success) return
    // Le chemin est un index numérique → aucun champ nommé collecté.
    expect(fieldErrors(res.error)).toEqual({})
  })
})

describe('exportErrorMessage', () => {
  it('42501 → site hors périmètre', () => {
    expect(exportErrorMessage(pgError('42501'))).toBe(
      'Action non autorisée : vous n’avez pas accès à ce site.',
    )
  })

  it('23505 → élément du même nom déjà présent', () => {
    expect(exportErrorMessage(pgError('23505'))).toBe(
      'Un élément du même nom existe déjà sur ce site (copie déjà effectuée ?).',
    )
  })

  it('P0002 → élément source introuvable', () => {
    expect(exportErrorMessage(pgError('P0002'))).toBe(
      'L’élément source (catégorie ou gamme) est introuvable ou a été supprimé. Rafraîchis la liste puis réessaie.',
    )
  })

  it('code inconnu → repli sur errorMessage', () => {
    expect(exportErrorMessage(new Error('détail brut'))).toBe('détail brut')
    expect(exportErrorMessage(pgError('99999'))).toBe('Une erreur est survenue')
  })
})

describe('deleteErrorMessage', () => {
  it('42501 et PGRST116 → hors périmètre ou déjà supprimé', () => {
    const attendu =
      'Action impossible : élément hors de votre périmètre, ou déjà supprimé.'
    expect(deleteErrorMessage(pgError('42501'))).toBe(attendu)
    expect(deleteErrorMessage(pgError('PGRST116'))).toBe(attendu)
  })

  it('23503 → encore lié par une FK', () => {
    expect(deleteErrorMessage(pgError('23503'))).toBe(
      'Cet élément est encore lié à d’autres données : dissociez-les d’abord.',
    )
  })

  it('code inconnu → repli sur errorMessage', () => {
    expect(deleteErrorMessage(new Error('message base'))).toBe('message base')
    expect(deleteErrorMessage(pgError('23001'))).toBe('Une erreur est survenue')
  })

  it('surcharge contextuelle prioritaire sur le message générique', () => {
    expect(
      deleteErrorMessage(pgError('23503'), {
        '23503': 'Ce local contient encore des équipements.',
      }),
    ).toBe('Ce local contient encore des équipements.')
  })

  it('surcharge sur un code sans message générique', () => {
    expect(
      deleteErrorMessage(pgError('23001'), {
        '23001': 'Suppression bloquée par une règle.',
      }),
    ).toBe('Suppression bloquée par une règle.')
  })
})

describe('writeErrorMessage', () => {
  it('42501 et PGRST116 → hors périmètre ou déjà modifié', () => {
    const attendu =
      'Action impossible : élément hors de votre périmètre, ou déjà modifié.'
    expect(writeErrorMessage(pgError('42501'))).toBe(attendu)
    expect(writeErrorMessage(pgError('PGRST116'))).toBe(attendu)
  })

  it('22003 → montant trop élevé', () => {
    expect(writeErrorMessage(pgError('22003'))).toBe(
      'Montant trop élevé : réduisez la valeur.',
    )
  })

  it('23514 → valeur refusée par une règle (CHECK)', () => {
    expect(writeErrorMessage(pgError('23514'))).toBe(
      'Valeur refusée : elle ne respecte pas une règle.',
    )
  })

  it('23505 → doublon (unicité)', () => {
    expect(writeErrorMessage(pgError('23505'))).toBe(
      'Un élément identique existe déjà.',
    )
  })

  it('23503 → référence FK manquante', () => {
    expect(writeErrorMessage(pgError('23503'))).toBe(
      'Référence manquante : un élément lié est introuvable.',
    )
  })

  it('code inconnu → repli sur errorMessage', () => {
    expect(writeErrorMessage(new Error('brut'))).toBe('brut')
    expect(writeErrorMessage(pgError('00000'))).toBe('Une erreur est survenue')
  })

  it('surcharge contextuelle prioritaire sur le message générique', () => {
    expect(
      writeErrorMessage(pgError('23505'), {
        '23505': 'Une catégorie portant ce nom existe déjà à cet emplacement.',
      }),
    ).toBe('Une catégorie portant ce nom existe déjà à cet emplacement.')
  })
})
