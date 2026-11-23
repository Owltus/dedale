import { describe, expect, it } from 'vitest'
import { sha256Hex } from './image'

// Gel : ce hash alimente l'index unique `documents_unique_hash` (dédoublonnage
// des documents) — sa valeur pour un contenu donné ne doit jamais changer.
describe('sha256Hex', () => {
  const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

  it("hache le contenu d'un File (vecteur NIST « abc »)", async () => {
    expect(await sha256Hex(new File(['abc'], 'a.txt'))).toBe(ABC)
  })

  it('donne le même hash pour un ArrayBuffer de même contenu', async () => {
    const buffer = new TextEncoder().encode('abc').buffer
    expect(await sha256Hex(buffer)).toBe(ABC)
  })
})
