import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadDocument } from './upload'

/**
 * TESTS DE GEL (phase 0 de l'audit d'architecture) : le dépôt d'un document
 * suit la doctrine (a) Storage → (b) ligne `documents`, avec trois issues déjà
 * voulues par le code — succès, doublon de contenu réutilisé, échec avec
 * retour arrière du fichier envoyé. On fige ces trois issues.
 */
interface Scenario {
  journal: string[]
  uploadErreur: { message: string } | null
  insertReponse: {
    data: { id: string; storage_path: string } | null
    error: { code: string; message: string } | null
  }
  existant: { data: { id: string; storage_path: string } | null; error: null }
}
const scenario = vi.hoisted(
  (): Scenario => ({
    journal: [],
    uploadErreur: null,
    insertReponse: { data: null, error: null },
    existant: { data: null, error: null },
  }),
)

vi.mock('@/lib/supabase', () => {
  const requeteDocuments = () => {
    let insertion = false
    const chaine: Record<string, unknown> = {
      insert: () => {
        insertion = true
        scenario.journal.push('documents insert')
        return chaine
      },
      select: () => {
        if (!insertion) scenario.journal.push('documents select (existant)')
        return chaine
      },
      eq: () => chaine,
      single: () =>
        Promise.resolve(insertion ? scenario.insertReponse : scenario.existant),
    }
    return chaine
  }
  return {
    supabase: {
      from: (table: string) => {
        if (table !== 'documents') throw new Error(`table inattendue ${table}`)
        return requeteDocuments()
      },
      storage: {
        from: () => ({
          upload: (chemin: string) => {
            scenario.journal.push(`storage upload ${chemin.split('/')[0]!}`)
            return Promise.resolve({ error: scenario.uploadErreur })
          },
          remove: (chemins: string[]) => {
            scenario.journal.push(`storage remove ${String(chemins.length)}`)
            return Promise.resolve({ error: null })
          },
        }),
      },
    },
  }
})

const fichier = () =>
  new File(['%PDF-1.4 contenu'], 'rapport.pdf', { type: 'application/pdf' })

beforeEach(() => {
  scenario.journal = []
  scenario.uploadErreur = null
  scenario.insertReponse = {
    data: { id: 'D1', storage_path: 'S/x' },
    error: null,
  }
  scenario.existant = { data: null, error: null }
})

describe('uploadDocument — gel', () => {
  it('succès : fichier envoyé dans le dossier du site, puis ligne documents', async () => {
    const r = await uploadDocument({
      file: fichier(),
      siteId: 'S',
      uploadedBy: 'U',
      typeDocumentId: 1,
    })
    expect(scenario.journal).toEqual(['storage upload S', 'documents insert'])
    expect(r).toEqual({ id: 'D1', storage_path: 'S/x' })
  })

  it('échec du fichier : rien n’est écrit en base, l’erreur remonte', async () => {
    scenario.uploadErreur = { message: 'quota' }
    await expect(
      uploadDocument({
        file: fichier(),
        siteId: 'S',
        uploadedBy: 'U',
        typeDocumentId: 1,
      }),
    ).rejects.toEqual({ message: 'quota' })
    expect(scenario.journal).toEqual(['storage upload S'])
  })

  it('doublon de contenu : fichier retiré, document existant réutilisé', async () => {
    scenario.insertReponse = {
      data: null,
      error: { code: '23505', message: 'violates documents_unique_hash' },
    }
    scenario.existant = {
      data: { id: 'ANCIEN', storage_path: 'S/a' },
      error: null,
    }
    const r = await uploadDocument({
      file: fichier(),
      siteId: 'S',
      uploadedBy: 'U',
      typeDocumentId: 1,
    })
    expect(scenario.journal).toEqual([
      'storage upload S',
      'documents insert',
      'storage remove 1',
      'documents select (existant)',
    ])
    expect(r).toEqual({ id: 'ANCIEN', storage_path: 'S/a', dejaExistant: true })
  })

  it('autre erreur d’écriture : fichier retiré (retour arrière), l’erreur remonte', async () => {
    const refus = { code: '42501', message: 'RLS' }
    scenario.insertReponse = { data: null, error: refus }
    await expect(
      uploadDocument({
        file: fichier(),
        siteId: 'S',
        uploadedBy: 'U',
        typeDocumentId: 1,
      }),
    ).rejects.toBe(refus)
    expect(scenario.journal).toEqual([
      'storage upload S',
      'documents insert',
      'storage remove 1',
    ])
  })
})
