import { describe, expect, it } from 'vitest'
import { motifSchema } from './motif-dialog'

// Schéma réellement porté par MotifDialog (annuler/rouvrir un OT, clôturer des
// travaux…) : c'est lui que toutes les modales de motif valident.
describe('motifSchema', () => {
  it('le motif d’annulation ou de réouverture est obligatoire et borné', () => {
    // ORACLE (CHECK + RPC backend) : motif non vide une fois ROGNÉ (des espaces
    // ne sont pas un motif) et au plus 2000 caractères.
    const vide = motifSchema.safeParse({ motif: '   ' })
    expect(vide.success).toBe(false)
    expect(vide.error?.issues[0]?.message).toBe('Le motif est obligatoire')

    const tropLong = motifSchema.safeParse({ motif: 'x'.repeat(2001) })
    expect(tropLong.success).toBe(false)

    // Un motif réel passe et ressort ROGNÉ (le `.trim()` fait partie du schéma).
    const valide = motifSchema.safeParse({ motif: '  Fuite constatée  ' })
    expect(valide.success).toBe(true)
    expect(valide.data?.motif).toBe('Fuite constatée')

    // La borne haute est bien 2000 (et non un minimum) : 2000 caractères passent.
    expect(motifSchema.safeParse({ motif: 'x'.repeat(2000) }).success).toBe(
      true,
    )
  })
})
