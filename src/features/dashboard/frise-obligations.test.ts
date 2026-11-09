import { describe, expect, it } from 'vitest'
import type { PlanningOt } from '@/features/planning/grille'
import {
  construireBandes,
  regrouperParMois,
  type GammeFrise,
  type Jalon,
} from './frise-obligations'

const AUJOURDHUI = new Date(2026, 10, 9) // lundi 9 novembre 2026

const gamme = (p: Partial<GammeFrise> = {}): GammeFrise => ({
  id: 'g1',
  nom: 'Extincteurs',
  nature: 'controle_reglementaire',
  est_active: true,
  jours: 365,
  ...p,
})

const ot = (p: Partial<PlanningOt>): PlanningOt => ({
  id: 'ot',
  statut: 'planifie',
  origine: 'programme',
  tolerance_jours: 0,
  gamme_id: 'g1',
  nom_gamme: 'Extincteurs',
  nature_gamme: 'controle_reglementaire',
  nom_prestataire: '',
  nom_equipement: null,
  description_gamme: null,
  nom_categorie: null,
  libelle_periodicite: 'Annuel',
  date_prevue: '2027-03-01',
  date_debut: null,
  date_cloture: null,
  miniature_id: null,
  ...p,
})

const bandes = (gammes: GammeFrise[], ots: PlanningOt[]) =>
  construireBandes({
    gammes,
    ots,
    debut: new Date(2026, 0, 1),
    fin: new Date(2029, 11, 31),
    aujourdHui: AUJOURDHUI,
  })

describe('construireBandes (frise des obligations)', () => {
  it('trois bandes, dans l’ordre des natures d’obligation', () => {
    expect(bandes([], []).map((b) => b.nature)).toEqual([
      'controle_reglementaire',
      'hygiene_sanitaire',
      'formation_habilitation',
    ])
  })

  it('ignore les natures courantes', () => {
    const b = bandes([gamme({ nature: 'maintenance_preventive' })], [])
    expect(b.flatMap((x) => x.jalons)).toEqual([])
  })

  it('distingue programmé (appli) et planifié (humain), puis estime la suite', () => {
    const j = bandes(
      [gamme(), gamme({ id: 'g2', nom: 'Alarme' })],
      [ot({ id: 'a' }), ot({ id: 'b', gamme_id: 'g2', origine: 'planifie' })],
    )[0]!.jalons
    expect(j.filter((x) => x.gammeId === 'g1').map((x) => x.etat)).toEqual([
      'programme',
      'estime',
      'estime',
    ])
    expect(j.find((x) => x.otId === 'b')?.etat).toBe('planifie')
    // Annuel : même semaine ISO l’année suivante (lundis 28/02/2028, 26/02/2029).
    expect(
      j
        .filter((x) => x.gammeId === 'g1' && x.etat === 'estime')
        .map((x) => x.date),
    ).toEqual(['2028-02-28', '2029-02-26'])
  })

  it('un OT en retard est rouge et la suite repart de la semaine courante', () => {
    const j = bandes(
      [gamme({ jours: 30 })],
      [ot({ date_prevue: '2026-10-05' })],
    )[0]!.jalons
    expect(j[0]?.etat).toBe('retard')
    const estimes = j.filter((x) => x.etat === 'estime')
    expect(estimes[0]!.date > '2026-11-09').toBe(true)
  })

  it('clôturé et annulé absents (la frise regarde l’avenir) ; sans OT ouvert, la suite part de la clôture', () => {
    const j = bandes(
      [gamme()],
      [
        ot({ id: 'c', statut: 'cloture', date_cloture: '2026-03-04' }),
        ot({ id: 'x', statut: 'annule', date_prevue: '2026-06-01' }),
      ],
    )[0]!.jalons
    expect(j.map((x) => x.etat)).toEqual(['estime', 'estime', 'estime'])
    // 04/03/2026 = semaine ISO 10 → lundi de la semaine 10 de 2027.
    expect(j[0]!.date).toBe('2027-03-08')
  })

  it('gamme inactive ou ponctuelle : aucun passage estimé', () => {
    const j = bandes(
      [gamme({ est_active: false }), gamme({ id: 'g2', jours: 0 })],
      [],
    )[0]!.jalons
    expect(j).toEqual([])
  })

  it('une marque par mois, colorée par le passage le MOINS organisé', () => {
    const jalon = (date: string, etat: Jalon['etat']): Jalon => ({
      cle: date + etat,
      gammeId: etat,
      gammeNom: etat,
      date,
      etat,
      otId: null,
    })
    const mois = regrouperParMois([
      jalon('2026-11-18', 'planifie'),
      jalon('2026-11-02', 'estime'),
      jalon('2026-12-07', 'planifie'),
      jalon('2026-11-30', 'programme'),
    ])
    expect(mois.map((x) => [x.debut, x.etat, x.jalons.length])).toEqual([
      ['2026-11-01', 'programme', 3],
      ['2026-12-01', 'planifie', 1],
    ])
  })
})
