import { describe, expect, it } from 'vitest'
import { canSeeNav, landingFor, type NavKey } from './nav'

const TOUTES: NavKey[] = [
  '/',
  '/planning',
  '/gammes',
  '/ordres-travail',
  '/demandes',
  '/chantiers',
  '/releves',
  '/registre',
  '/documents',
  '/investissements',
  '/sites',
  '/localisations',
  '/equipements',
  '/prestataires',
  '/utilisateurs',
]

describe('canSeeNav', () => {
  it('admin voit tout', () => {
    for (const k of TOUTES) expect(canSeeNav(k, 'admin')).toBe(true)
  })

  it('demandeur ne voit QUE les demandes', () => {
    const visibles = TOUTES.filter((k) => canSeeNav(k, 'demandeur'))
    expect(visibles).toEqual(['/demandes'])
  })

  it('lecteur voit les écrans métier en lecture mais pas la gestion', () => {
    expect(canSeeNav('/', 'lecteur')).toBe(true)
    expect(canSeeNav('/planning', 'lecteur')).toBe(true)
    expect(canSeeNav('/gammes', 'lecteur')).toBe(true)
    expect(canSeeNav('/prestataires', 'lecteur')).toBe(true)
    // Vue produit curatée : pas de budget, ni gestion sites/utilisateurs.
    expect(canSeeNav('/investissements', 'lecteur')).toBe(false)
    expect(canSeeNav('/sites', 'lecteur')).toBe(false)
    expect(canSeeNav('/utilisateurs', 'lecteur')).toBe(false)
  })

  it('technicien comme lecteur côté visibilité (pas investissements/sites/utilisateurs)', () => {
    expect(canSeeNav('/ordres-travail', 'technicien')).toBe(true)
    expect(canSeeNav('/investissements', 'technicien')).toBe(false)
    expect(canSeeNav('/sites', 'technicien')).toBe(false)
    expect(canSeeNav('/utilisateurs', 'technicien')).toBe(false)
  })

  it('manager voit investissements et utilisateurs, mais pas les sites', () => {
    expect(canSeeNav('/investissements', 'manager')).toBe(true)
    expect(canSeeNav('/utilisateurs', 'manager')).toBe(true)
    expect(canSeeNav('/sites', 'manager')).toBe(false)
  })

  it('sites est réservé à admin', () => {
    expect(canSeeNav('/sites', 'admin')).toBe(true)
    expect(canSeeNav('/sites', 'manager')).toBe(false)
  })

  it('les demandes sont visibles par tous les rôles', () => {
    for (const r of [
      'admin',
      'manager',
      'technicien',
      'lecteur',
      'demandeur',
    ]) {
      expect(canSeeNav('/demandes', r)).toBe(true)
    }
  })

  it('rôle non chargé (null/undefined) : ne bloque rien (la RLS protège)', () => {
    for (const k of TOUTES) {
      expect(canSeeNav(k, null)).toBe(true)
      expect(canSeeNav(k, undefined)).toBe(true)
    }
  })
})

describe('landingFor', () => {
  it('le demandeur atterrit sur /demandes', () => {
    expect(landingFor('demandeur')).toBe('/demandes')
  })

  it('les autres rôles atterrissent sur le tableau de bord', () => {
    expect(landingFor('admin')).toBe('/')
    expect(landingFor('manager')).toBe('/')
    expect(landingFor('technicien')).toBe('/')
    expect(landingFor('lecteur')).toBe('/')
    expect(landingFor(null)).toBe('/')
  })

  it('la landing est toujours visible par le rôle (pas de boucle)', () => {
    // Inclut un rôle inattendu hors des 5 codes connus.
    for (const r of [
      'admin',
      'manager',
      'technicien',
      'lecteur',
      'demandeur',
      'role-inconnu',
    ]) {
      expect(canSeeNav(landingFor(r), r)).toBe(true)
    }
  })
})
