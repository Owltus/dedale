import { describe, expect, it } from 'vitest'
import {
  canSeeNav,
  landingFor,
  NAV_LABELS,
  sectionDeChemin,
  type NavKey,
} from './nav'

const TOUTES: NavKey[] = [
  '/',
  '/planning',
  '/gammes',
  '/ordres-travail',
  '/demandes',
  '/travaux',
  '/evenements',
  '/releves',
  '/registre',
  '/documents',
  '/investissements',
  '/sites',
  '/localisations',
  '/equipements',
  '/prestataires',
  '/utilisateurs',
  '/bibliotheque',
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
    // Investissements : visible en LECTURE, miroir de la RLS réelle
    // (capex_site_scoped_select autorise manager/technicien/lecteur sur leurs
    // sites). L'écriture, elle, reste filtrée dans la page.
    expect(canSeeNav('/investissements', 'lecteur')).toBe(true)
    // Gestion réservée : sites (admin) et utilisateurs (administratif).
    expect(canSeeNav('/sites', 'lecteur')).toBe(false)
    expect(canSeeNav('/utilisateurs', 'lecteur')).toBe(false)
    // Bibliothèque : outil des rôles métier, lecteur exclu.
    expect(canSeeNav('/bibliotheque', 'lecteur')).toBe(false)
  })

  it('technicien voit les écrans métier, pas la gestion sites/utilisateurs', () => {
    expect(canSeeNav('/ordres-travail', 'technicien')).toBe(true)
    // Miroir de la RLS : le technicien crée et édite un investissement sur ses
    // sites (la suppression reste admin, gérée dans la page).
    expect(canSeeNav('/investissements', 'technicien')).toBe(true)
    expect(canSeeNav('/bibliotheque', 'technicien')).toBe(true)
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

describe('sectionDeChemin', () => {
  it('reconnaît une page de liste', () => {
    expect(sectionDeChemin('/travaux')).toBe('Travaux')
    expect(sectionDeChemin('/investissements')).toBe('Investissements')
  })

  it('rattache une fiche de détail à la section de sa liste', () => {
    expect(sectionDeChemin('/travaux/remplacement-copieur')).toBe('Travaux')
    expect(sectionDeChemin('/equipements/securite-incendie/extincteur')).toBe(
      'Équipements',
    )
  })

  it('traite la racine en correspondance EXACTE', () => {
    // Sans ce cas à part, `/` (préfixe de tout) l'emporterait sur chaque page.
    expect(sectionDeChemin('/')).toBe('Tableau de bord')
    expect(sectionDeChemin('/planning')).toBe('Planning')
  })

  it('renvoie null hors de la navigation', () => {
    expect(sectionDeChemin('/profil')).toBeNull()
    expect(sectionDeChemin('/login')).toBeNull()
  })

  it('ne confond pas deux chemins de même préfixe textuel', () => {
    // « /documents » ne doit pas capter un hypothétique « /documentsXYZ ».
    expect(sectionDeChemin('/documentsXYZ')).toBeNull()
  })

  it('affiche le libellé PRODUIT, pas le nom technique de la route', () => {
    expect(NAV_LABELS['/gammes']).toBe('Plan de maintenance')
  })
})
