import { describe, expect, it } from 'vitest'
import {
  canCreateDemande,
  canEditUser,
  canManageAdmin,
  canManageMetier,
  canResolveDemande,
  isAdmin,
} from './permissions'

describe('isAdmin', () => {
  it('vrai pour admin uniquement', () => {
    expect(isAdmin('admin')).toBe(true)
    expect(isAdmin('manager')).toBe(false)
    expect(isAdmin(null)).toBe(false)
  })
})

describe('canManageMetier', () => {
  it('admin, manager et technicien', () => {
    expect(canManageMetier('admin')).toBe(true)
    expect(canManageMetier('manager')).toBe(true)
    expect(canManageMetier('technicien')).toBe(true)
    expect(canManageMetier('lecteur')).toBe(false)
    expect(canManageMetier('demandeur')).toBe(false)
    expect(canManageMetier(null)).toBe(false)
  })
})

describe('canManageAdmin', () => {
  it('admin et manager seulement', () => {
    expect(canManageAdmin('admin')).toBe(true)
    expect(canManageAdmin('manager')).toBe(true)
    expect(canManageAdmin('technicien')).toBe(false)
    expect(canManageAdmin(undefined)).toBe(false)
  })
})

describe('canCreateDemande', () => {
  it('tout rôle sauf lecteur ; absence de rôle = non', () => {
    expect(canCreateDemande('demandeur')).toBe(true)
    expect(canCreateDemande('technicien')).toBe(true)
    expect(canCreateDemande('lecteur')).toBe(false)
    expect(canCreateDemande(null)).toBe(false)
  })
})

describe('canResolveDemande', () => {
  it('équivaut aux rôles métier', () => {
    expect(canResolveDemande('technicien')).toBe(true)
    expect(canResolveDemande('lecteur')).toBe(false)
  })
})

describe('canEditUser', () => {
  it('un admin édite tout utilisateur', () => {
    expect(canEditUser('admin', 'manager')).toBe(true)
    expect(canEditUser('admin', 'admin')).toBe(true)
  })

  it('un manager édite seulement ses subordonnés', () => {
    expect(canEditUser('manager', 'technicien')).toBe(true)
    expect(canEditUser('manager', 'lecteur')).toBe(true)
    expect(canEditUser('manager', 'demandeur')).toBe(true)
    expect(canEditUser('manager', 'manager')).toBe(false)
    expect(canEditUser('manager', 'admin')).toBe(false)
  })

  it('les autres rôles n’éditent personne', () => {
    expect(canEditUser('technicien', 'lecteur')).toBe(false)
    expect(canEditUser(null, 'lecteur')).toBe(false)
  })
})
