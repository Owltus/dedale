import { describe, expect, it } from 'vitest'
import {
  SCOPE_ALL,
  SCOPE_COMMUN,
  estCommunOuDuSite,
  resolvePorteeScope,
  scopeMatches,
  scopeTarget,
  siteIdPourPortee,
  sousCategoriesNiveau2,
  type CategorieNiveau,
} from './scope'

const SITE_A = 'site-a'
const SITE_B = 'site-b'

describe('constantes de scope', () => {
  it('valeurs alignées sur le backend', () => {
    expect(SCOPE_ALL).toBe('all')
    expect(SCOPE_COMMUN).toBe('entreprise')
  })
})

describe('scopeMatches', () => {
  it('« all » accepte tout (commun comme site)', () => {
    expect(scopeMatches(SCOPE_ALL, null)).toBe(true)
    expect(scopeMatches(SCOPE_ALL, SITE_A)).toBe(true)
  })

  it('« entreprise » n’accepte que le commun (site_id null)', () => {
    expect(scopeMatches(SCOPE_COMMUN, null)).toBe(true)
    expect(scopeMatches(SCOPE_COMMUN, SITE_A)).toBe(false)
  })

  it('un id de site n’accepte que ce site', () => {
    expect(scopeMatches(SITE_A, SITE_A)).toBe(true)
    expect(scopeMatches(SITE_A, SITE_B)).toBe(false)
    expect(scopeMatches(SITE_A, null)).toBe(false)
  })
})

describe('estCommunOuDuSite', () => {
  it('une ligne commune (site_id null) est toujours visible', () => {
    expect(estCommunOuDuSite({ site_id: null }, SITE_A)).toBe(true)
    expect(estCommunOuDuSite({ site_id: null }, null)).toBe(true)
  })

  it('une ligne de site n’est visible que depuis ce site', () => {
    expect(estCommunOuDuSite({ site_id: SITE_A }, SITE_A)).toBe(true)
    expect(estCommunOuDuSite({ site_id: SITE_A }, SITE_B)).toBe(false)
    expect(estCommunOuDuSite({ site_id: SITE_A }, null)).toBe(false)
  })
})

describe('siteIdPourPortee', () => {
  it('portée « entreprise » écrit toujours NULL (commun)', () => {
    expect(siteIdPourPortee('entreprise', SITE_A)).toBeNull()
    expect(siteIdPourPortee('entreprise', null)).toBeNull()
  })

  it('portée « site » écrit le site actif tel quel', () => {
    expect(siteIdPourPortee('site', SITE_A)).toBe(SITE_A)
    expect(siteIdPourPortee('site', null)).toBeNull()
  })
})

describe('scopeTarget', () => {
  it('« all » → undefined (pas de cible unique)', () => {
    expect(scopeTarget(SCOPE_ALL)).toBeUndefined()
  })

  it('« entreprise » → null (Commun)', () => {
    expect(scopeTarget(SCOPE_COMMUN)).toBeNull()
  })

  it('un id de site → cet id', () => {
    expect(scopeTarget(SITE_A)).toBe(SITE_A)
  })
})

describe('resolvePorteeScope', () => {
  it('création sans verrou, rôle entreprise : garde la portée du schéma', () => {
    const r = resolvePorteeScope({
      portee: 'entreprise',
      siteId: SITE_A,
      canEntreprise: true,
      isEdit: false,
    })
    expect(r.porteeInitiale).toBe('entreprise')
    expect(r.showEntreprise).toBe(true)
    expect(r.hidePortee).toBe(false)
    // portée entreprise → image sur le pool commun (null)
    expect(r.miniatureSite).toBeNull()
    // upload sur le commun autorisé car rôle entreprise
    expect(r.canUploadMiniature).toBe(true)
    expect(r.createSiteId).toBe(SITE_A)
  })

  it('rôle NON entreprise : portée initiale forcée à « site »', () => {
    const r = resolvePorteeScope({
      portee: 'entreprise',
      siteId: SITE_A,
      canEntreprise: false,
      isEdit: false,
    })
    expect(r.porteeInitiale).toBe('site')
    // option Commun visible car la valeur courante est entreprise
    expect(r.showEntreprise).toBe(true)
    // miniature reste calculée sur la portée passée (entreprise → null)
    expect(r.miniatureSite).toBeNull()
    // upload sur le commun interdit sans droit entreprise
    expect(r.canUploadMiniature).toBe(false)
  })

  it('rôle NON entreprise, portée site : option Commun masquée', () => {
    const r = resolvePorteeScope({
      portee: 'site',
      siteId: SITE_A,
      canEntreprise: false,
      isEdit: false,
    })
    expect(r.porteeInitiale).toBe('site')
    expect(r.showEntreprise).toBe(false)
    // portée site → image sur le site, upload toujours autorisé
    expect(r.miniatureSite).toBe(SITE_A)
    expect(r.canUploadMiniature).toBe(true)
  })

  it('périmètre verrouillé (création depuis le +) : portée et site imposés, sélecteur masqué', () => {
    const r = resolvePorteeScope({
      portee: 'site',
      siteId: SITE_A,
      canEntreprise: true,
      lockedScope: { portee: 'entreprise', siteId: null },
      isEdit: false,
    })
    expect(r.porteeInitiale).toBe('entreprise')
    expect(r.hidePortee).toBe(true)
    // createSiteId vient du verrou, pas du site actif
    expect(r.createSiteId).toBeNull()
  })

  it('édition sous périmètre verrouillé : sélecteur NON masqué', () => {
    const r = resolvePorteeScope({
      portee: 'site',
      siteId: SITE_A,
      canEntreprise: true,
      lockedScope: { portee: 'site', siteId: SITE_B },
      isEdit: true,
    })
    // hidePortee = !isEdit && locked → false en édition
    expect(r.hidePortee).toBe(false)
    expect(r.porteeInitiale).toBe('site')
    expect(r.createSiteId).toBe(SITE_B)
  })

  it('lockedScope null se comporte comme aucun verrou', () => {
    const r = resolvePorteeScope({
      portee: 'entreprise',
      siteId: SITE_A,
      canEntreprise: true,
      lockedScope: null,
      isEdit: false,
    })
    expect(r.hidePortee).toBe(false)
    expect(r.createSiteId).toBe(SITE_A)
    expect(r.porteeInitiale).toBe('entreprise')
  })
})

describe('sousCategoriesNiveau2', () => {
  it('apparie une sous-catégorie à sa racine dans le périmètre du site', () => {
    const cats: CategorieNiveau[] = [
      { id: 'r1', parent_id: null, site_id: null },
      { id: 's1', parent_id: 'r1', site_id: null },
    ]
    const res = sousCategoriesNiveau2(cats, SITE_A)
    expect(res).toEqual([{ sous: cats[1], racine: cats[0] }])
  })

  it('ignore une racine (parent_id null n’est jamais une sous-catégorie)', () => {
    const cats: CategorieNiveau[] = [
      { id: 'r1', parent_id: null, site_id: null },
    ]
    expect(sousCategoriesNiveau2(cats, SITE_A)).toEqual([])
  })

  it('ignore une sous-catégorie dont la racine est hors périmètre', () => {
    const cats: CategorieNiveau[] = [
      // racine d'un AUTRE site → hors périmètre depuis SITE_A
      { id: 'r1', parent_id: null, site_id: SITE_B },
      { id: 's1', parent_id: 'r1', site_id: null },
    ]
    // la racine n'est pas dans inScope → la sous-cat est écartée
    expect(sousCategoriesNiveau2(cats, SITE_A)).toEqual([])
  })

  it('ignore une sous-catégorie hors périmètre même si sa racine est visible', () => {
    const cats: CategorieNiveau[] = [
      { id: 'r1', parent_id: null, site_id: null },
      { id: 's1', parent_id: 'r1', site_id: SITE_B },
    ]
    expect(sousCategoriesNiveau2(cats, SITE_A)).toEqual([])
  })

  it('ignore une sous-catégorie orpheline (parent absent)', () => {
    const cats: CategorieNiveau[] = [
      { id: 's1', parent_id: 'inconnu', site_id: null },
    ]
    expect(sousCategoriesNiveau2(cats, SITE_A)).toEqual([])
  })

  it('retient le commun et le site actif, mêle les racines', () => {
    const cats: CategorieNiveau[] = [
      { id: 'rc', parent_id: null, site_id: null }, // racine commune
      { id: 'rs', parent_id: null, site_id: SITE_A }, // racine du site
      { id: 'sc', parent_id: 'rc', site_id: null }, // sous-cat commune
      { id: 'ss', parent_id: 'rs', site_id: SITE_A }, // sous-cat du site
    ]
    const res = sousCategoriesNiveau2(cats, SITE_A)
    expect(res).toEqual([
      { sous: cats[2], racine: cats[0] },
      { sous: cats[3], racine: cats[1] },
    ])
  })

  it('préserve l’ordre d’entrée des sous-catégories', () => {
    const cats: CategorieNiveau[] = [
      { id: 'r1', parent_id: null, site_id: null },
      { id: 's2', parent_id: 'r1', site_id: null },
      { id: 's1', parent_id: 'r1', site_id: null },
    ]
    const res = sousCategoriesNiveau2(cats, SITE_A)
    expect(res.map((e) => e.sous.id)).toEqual(['s2', 's1'])
  })

  it('siteId null : seul le commun est dans le périmètre', () => {
    const cats: CategorieNiveau[] = [
      { id: 'rc', parent_id: null, site_id: null },
      { id: 'sc', parent_id: 'rc', site_id: null },
      { id: 'rs', parent_id: null, site_id: SITE_A },
      { id: 'ss', parent_id: 'rs', site_id: SITE_A },
    ]
    const res = sousCategoriesNiveau2(cats, null)
    expect(res).toEqual([{ sous: cats[1], racine: cats[0] }])
  })

  it('liste vide → résultat vide', () => {
    expect(sousCategoriesNiveau2([], SITE_A)).toEqual([])
  })
})
