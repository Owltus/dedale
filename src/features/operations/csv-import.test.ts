import { describe, expect, it } from 'vitest'
import {
  COL_OPERATION,
  COL_ORDRE,
  COL_SEUIL_MAX,
  COL_SEUIL_MIN,
  COL_TYPE,
  COL_UNITE,
  blocColonnesOperation,
  parseNombreFr,
  parseOuiNon,
  resoudreOperation,
  type OperationRefs,
} from './csv-import'

const refs: OperationRefs = {
  types: [
    { id: 1, libelle: 'Vérification', necessite_seuils: false },
    { id: 4, libelle: 'Mesure', necessite_seuils: true },
  ],
  unites: [
    { id: 1, nom: 'Degrés Celsius', symbole: '°C', necessite_seuils: true },
    { id: 7, nom: 'Heure', symbole: 'h', necessite_seuils: false },
  ],
}

/** Petit lecteur de cellules par nom de colonne, comme le fait un parseur réel. */
const lecteur = (cellules: Record<string, string>) => (colonne: string) =>
  cellules[colonne] ?? ''

describe('resoudreOperation', () => {
  it('résout une opération simple sans unité ni seuils', () => {
    const r = resoudreOperation(
      lecteur({
        [COL_OPERATION]: 'Contrôler le serrage',
        [COL_ORDRE]: '2',
        [COL_TYPE]: 'Vérification',
      }),
      refs,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.operation.values).toMatchObject({
      nom: 'Contrôler le serrage',
      ordre: '2',
      type_operation_id: '1',
      unite_id: '',
    })
    expect(r.operation.aUnite).toBe(false)
    expect(r.operation.requiresSeuils).toBe(false)
  })

  it('résout une mesure avec unité et seuils à la française', () => {
    const r = resoudreOperation(
      lecteur({
        [COL_OPERATION]: 'Relever la température',
        [COL_TYPE]: 'Mesure',
        [COL_UNITE]: 'Degrés Celsius (°C)',
        [COL_SEUIL_MIN]: '18,5',
        [COL_SEUIL_MAX]: '24',
      }),
      refs,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.operation.values).toMatchObject({
      unite_id: '1',
      seuil_minimum: '18.5',
      seuil_maximum: '24',
    })
    expect(r.operation.requiresSeuils).toBe(true)
  })

  it('accepte l’unité écrite par son seul symbole', () => {
    const r = resoudreOperation(
      lecteur({
        [COL_OPERATION]: 'Relever',
        [COL_TYPE]: 'Mesure',
        [COL_UNITE]: '°C',
      }),
      refs,
    )
    expect(r.ok && r.operation.values.unite_id).toBe('1')
  })

  it('exige une unité pour une mesure et refuse un type inconnu', () => {
    const sansUnite = resoudreOperation(
      lecteur({ [COL_OPERATION]: 'Relever', [COL_TYPE]: 'Mesure' }),
      refs,
    )
    expect(sansUnite.ok).toBe(false)
    if (!sansUnite.ok)
      expect(sansUnite.erreurs.join(' ')).toContain('Unité est obligatoire')

    const typeInconnu = resoudreOperation(
      lecteur({ [COL_OPERATION]: 'Relever', [COL_TYPE]: 'Bricolage' }),
      refs,
    )
    expect(typeInconnu.ok).toBe(false)
    if (!typeInconnu.ok)
      expect(typeInconnu.erreurs.join(' ')).toContain('Bricolage')
  })

  it('ignore unité et seuils hors mesure, comme le formulaire', () => {
    const r = resoudreOperation(
      lecteur({
        [COL_OPERATION]: 'Nettoyer',
        [COL_TYPE]: 'Vérification',
        [COL_UNITE]: 'Heure (h)',
        [COL_SEUIL_MIN]: '3',
      }),
      refs,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.operation.values.unite_id).toBe('')
    expect(r.operation.values.seuil_minimum).toBe('')
  })

  it('refuse un minimum supérieur au maximum et un ordre non entier', () => {
    const seuils = resoudreOperation(
      lecteur({
        [COL_OPERATION]: 'Relever',
        [COL_TYPE]: 'Mesure',
        [COL_UNITE]: '°C',
        [COL_SEUIL_MIN]: '30',
        [COL_SEUIL_MAX]: '10',
      }),
      refs,
    )
    expect(seuils.ok).toBe(false)

    const ordre = resoudreOperation(
      lecteur({
        [COL_OPERATION]: 'Relever',
        [COL_ORDRE]: 'premier',
        [COL_TYPE]: 'Vérification',
      }),
      refs,
    )
    expect(ordre.ok).toBe(false)
  })
})

describe('blocColonnesOperation', () => {
  it('énumère les valeurs exactes des référentiels', () => {
    const bloc = blocColonnesOperation(refs).join('\n')
    expect(bloc).toContain('« Vérification »')
    expect(bloc).toContain('« Degrés Celsius (°C) »')
    // Les unités sans bornes ne sont pas proposées comme porteuses de seuils.
    expect(bloc).toMatch(/bornes \(Degrés Celsius \(°C\)\)/)
  })
})

describe('lecture des valeurs françaises', () => {
  it('lit les nombres à virgule et les Oui/Non tolérants', () => {
    expect(parseNombreFr('6,5')).toBe(6.5)
    expect(parseNombreFr('6.5')).toBe(6.5)
    expect(parseNombreFr('abc')).toBeNull()
    expect(parseOuiNon('OUI')).toBe(true)
    expect(parseOuiNon('n')).toBe(false)
    expect(parseOuiNon('peut-être')).toBeNull()
  })
})
