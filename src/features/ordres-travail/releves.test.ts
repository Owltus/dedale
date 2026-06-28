import { describe, expect, it } from 'vitest'
import { calculerRelevesParOt, type ReleveLigne } from './releves'

function ligne(p: {
  ot: string
  src: string
  val: number | null
  gamme?: string | null
  date?: string | null
  statut?: string
  depose?: number | null
  pose?: number | null
  symbole?: string
  dateExec?: string | null
}): ReleveLigne {
  return {
    ordre_travail_id: p.ot,
    source_type: 'operation',
    source_id: p.src,
    valeur_mesuree: p.val,
    index_depose: p.depose ?? null,
    index_pose: p.pose ?? null,
    statut: p.statut ?? 'terminee',
    date_execution: p.dateExec ?? p.date ?? null,
    created_at: '2026-01-01T00:00:00Z',
    unite_symbole: p.symbole ?? 'kWh',
    ordres_travail: {
      gamme_id: p.gamme ?? 'g1',
      date_prevue: p.date ?? null,
    },
  }
}

describe('calculerRelevesParOt', () => {
  it('somme les consos (relevé − précédent) par unité présente ≥ 2 fois', () => {
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot1', src: 'a', val: 100, date: '2026-01-01' }),
      ligne({ ot: 'ot1', src: 'b', val: 200, date: '2026-01-01' }),
      ligne({ ot: 'ot2', src: 'a', val: 130, date: '2026-02-01' }), // +30
      ligne({ ot: 'ot2', src: 'b', val: 250, date: '2026-02-01' }), // +50
    ])
    expect(map.get('ot2')).toBe('80 kWh')
    // ot1 n'a aucun précédent → aucune conso calculable → pas de relevé.
    expect(map.has('ot1')).toBe(false)
  })

  it('affiche la valeur même avec un seul compteur (carte de liste, ≠ détail)', () => {
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot1', src: 'a', val: 100, date: '2026-01-01' }),
      ligne({ ot: 'ot2', src: 'a', val: 130, date: '2026-02-01' }), // +30
    ])
    expect(map.get('ot2')).toBe('30 kWh')
    // ot1 reste sans précédent → rien.
    expect(map.has('ot1')).toBe(false)
  })

  it('gère un remplacement de compteur : (dépose − précédent) + (courant − pose)', () => {
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot1', src: 'a', val: 100, date: '2026-01-01' }),
      ligne({ ot: 'ot1', src: 'b', val: 200, date: '2026-01-01' }),
      // A remplacé : (150 − 100) + (20 − 0) = 70
      ligne({
        ot: 'ot2',
        src: 'a',
        val: 20,
        depose: 150,
        pose: 0,
        date: '2026-02-01',
      }),
      ligne({ ot: 'ot2', src: 'b', val: 250, date: '2026-02-01' }), // +50
    ])
    expect(map.get('ot2')).toBe('120 kWh')
  })

  it('ne prend pas un OT futur ou de même date comme précédent (antériorité stricte)', () => {
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot1', src: 'a', val: 100, date: '2026-02-01' }),
      ligne({ ot: 'ot1', src: 'b', val: 200, date: '2026-02-01' }),
      // Même date que ot1 → ne peut pas servir de précédent à ot1.
      ligne({ ot: 'ot2', src: 'a', val: 130, date: '2026-02-01' }),
      ligne({ ot: 'ot2', src: 'b', val: 250, date: '2026-02-01' }),
    ])
    expect(map.has('ot1')).toBe(false)
    expect(map.has('ot2')).toBe(false)
  })

  it('ignore un relevé précédent NON terminé', () => {
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot1', src: 'a', val: 100, date: '2026-01-01', statut: 'en_cours' }),
      ligne({ ot: 'ot1', src: 'b', val: 200, date: '2026-01-01', statut: 'en_cours' }),
      ligne({ ot: 'ot2', src: 'a', val: 130, date: '2026-02-01' }),
      ligne({ ot: 'ot2', src: 'b', val: 250, date: '2026-02-01' }),
    ])
    // Les relevés d'ot1 (en cours) ne comptent pas comme précédent → ot2 sans base.
    expect(map.has('ot2')).toBe(false)
  })
})
