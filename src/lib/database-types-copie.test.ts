import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Les Edge Functions (Deno) typent leurs clients avec une COPIE des types de
 * la base (`supabase/functions/_shared/database.types.ts`) : elles ne peuvent
 * pas importer `src/`. `npm run gen:types` régénère les deux ; ce test rougit
 * si la copie dérive (types régénérés à la main d'un seul côté).
 */
describe('types de la base : copie des Edge Functions', () => {
  it('identique à src/lib/database.types.ts', () => {
    const lire = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
    expect(lire('supabase/functions/_shared/database.types.ts')).toBe(
      lire('src/lib/database.types.ts'),
    )
  })
})
