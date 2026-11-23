import { describe, expect, it } from 'vitest'
import schemaVersionne from '../../schema_complete.sql?raw'

/**
 * Une seule définition par fonction dans `schema_complete.sql`.
 *
 * Le fichier est la source de vérité LISIBLE du schéma : quand une migration
 * redéfinit une fonction, son corps à jour est reporté à la première définition
 * (là où vivent ses COMMENT, REVOKE et GRANT) au lieu d'être recopié plus bas.
 * Deux `CREATE FUNCTION public.x` laisseraient lire une version périmée.
 */
describe('schema_complete.sql — fonctions', () => {
  it('ne définit aucune fonction public.* plus d’une fois', () => {
    const occurrences = new Map<string, number>()
    for (const [, nom] of schemaVersionne.matchAll(
      /CREATE (?:OR REPLACE )?FUNCTION +public\.([a-z0-9_]+)/gi,
    )) {
      const cle = (nom ?? '').toLowerCase()
      occurrences.set(cle, (occurrences.get(cle) ?? 0) + 1)
    }
    const doublons = [...occurrences]
      .filter(([, n]) => n > 1)
      .map(([nom, n]) => `${nom} (${String(n)})`)
    expect(occurrences.size).toBeGreaterThan(0)
    expect(doublons).toEqual([])
  })
})
