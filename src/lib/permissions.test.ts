import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { RUNS, arbChaineHostile } from './hostile-inputs.test'
import {
  ROLE_CODES,
  canCreateDemande,
  canDeleteDemande,
  canEditDemande,
  canEditUser,
  canManageAdmin,
  canManageMetier,
  canResolveDemande,
  isAdmin,
  isDemandeur,
  roleLabel,
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

// ─────────────────────────────────────────────────────────────────────────────
// Ajouts Martin — couverture des helpers non testés et MATRICE exhaustive des
// droits sur une demande d'intervention (miroir RLS).
// ─────────────────────────────────────────────────────────────────────────────

describe('roleLabel', () => {
  it('rend le libellé français de chaque code du référentiel', () => {
    // Oracle : ROLE_LABELS — 5 rôles (doctrine backend §2).
    expect(ROLE_CODES.map(roleLabel)).toEqual([
      'Administrateur',
      'Manager',
      'Technicien',
      'Lecteur',
      'Demandeur',
    ])
  })

  it('replie sur le code brut pour un rôle inconnu, et sur « — » sans rôle', () => {
    // Oracle : commentaire de la fonction — « repli sur le code brut, puis « — » ».
    expect(roleLabel('superviseur')).toBe('superviseur')
    expect(roleLabel(null)).toBe('—')
    expect(roleLabel(undefined)).toBe('—')
  })

  it('rend toujours une chaîne, propriétés héritées comprises', () => {
    // Oracle : `roleLabel` rend TOUJOURS une chaîne — sa valeur part directement
    // dans le JSX (badge de rôle, colonne « Rôle » de la liste des
    // utilisateurs) — et un code hors référentiel est rendu tel quel, comme la
    // fonction le documente elle-même.
    // RÉGRESSION COUVERTE : `code in ROLE_LABELS` est vrai pour TOUTE propriété
    // héritée d'Object.prototype. `ROLE_LABELS['toString']` rendait la FONCTION
    // native ; `ROLE_LABELS['__proto__']` rendait Object.prototype, un OBJET
    // (typeof 'object') — que React affiche comme rien du tout. La garde est
    // désormais `Object.hasOwn(ROLE_LABELS, code)`.
    // Contre-exemples trouvés par le générateur : '__proto__', 'constructor' ;
    // à la main : 'toString', 'valueOf', 'hasOwnProperty'.
    for (const cle of [
      'toString',
      'constructor',
      '__proto__',
      'hasOwnProperty',
      'valueOf',
    ]) {
      expect(roleLabel(cle)).toBe(cle)
    }
    fc.assert(
      fc.property(
        fc.oneof(arbChaineHostile(), fc.constant(null), fc.constant(undefined)),
        (code) => {
          expect(typeof roleLabel(code)).toBe('string')
        },
      ),
      RUNS,
    )
  })

  it('un code de rôle VIDE s’affiche « — »', () => {
    // Oracle : '' n'est pas un code de rôle → même repli que null/undefined, le
    // tiret cadratin qui signale « pas de rôle ».
    // RÉGRESSION COUVERTE : `code && …` était faux, puis `code ?? '—'` rendait ''
    // (qui n'est ni null ni undefined) → cellule vide, indiscernable d'un bug
    // d'affichage. Le repli est maintenant piloté par `if (!code) return '—'`.
    expect(roleLabel('')).toBe('—')
  })
})

describe('isDemandeur', () => {
  it('vrai pour demandeur uniquement', () => {
    // Oracle : « rôle « externe » (signale des demandes) ; layout dédié ».
    for (const r of ROLE_CODES) {
      expect(isDemandeur(r)).toBe(r === 'demandeur')
    }
    expect(isDemandeur(null)).toBe(false)
    expect(isDemandeur(undefined)).toBe(false)
    expect(isDemandeur('demandeurs')).toBe(false) // pas de correspondance partielle
    expect(isDemandeur('Demandeur')).toBe(false) // codes sensibles à la casse
  })
})

// ─── Matrice rôle × statut × auteur, pour canEditDemande / canDeleteDemande ──

/** Statuts du cycle d'une DI (référentiel `statuts_di`, transitions libres / 052). */
const STATUTS_DI = [
  { id: 1, libelle: 'Ouvert' },
  { id: 2, libelle: 'En cours' },
  { id: 3, libelle: 'Clôturé' },
] as const

const MOI = '11111111-1111-4111-8111-111111111111'
const AUTRUI = '22222222-2222-4222-8222-222222222222'

/**
 * ORACLE — règle écrite, PAS la sortie de la fonction. Source :
 *  - doctrine CLAUDE.md §2 (5 rôles, « mes sites », jamais d'assignation nominative) ;
 *  - commentaires de `canEditDemande` / `canDeleteDemande` ;
 *  - policies RLS citées : `di_site_scoped_update` / `di_site_scoped_delete`
 *    (admin/manager/technicien, tout le périmètre) et `di_demandeur_update` /
 *    `di_demandeur_delete` (own + statut_di_id = 1).
 * Le lecteur (lecture seule) et l'absence de rôle ne peuvent jamais écrire.
 */
function oracleDroitDi(
  role: string | null | undefined,
  statutId: number,
  auteur: string | null,
  userId: string | undefined,
): boolean {
  if (role === 'admin' || role === 'manager' || role === 'technicien')
    return true
  if (role === 'demandeur') {
    return userId !== undefined && auteur === userId && statutId === 1
  }
  return false
}

describe('canEditDemande / canDeleteDemande — matrice rôle × statut × auteur', () => {
  const ROLES: (string | null | undefined)[] = [...ROLE_CODES, null, undefined]

  for (const role of ROLES) {
    for (const statut of STATUTS_DI) {
      for (const [quiLabel, auteur] of [
        ['SA demande', MOI],
        ['la demande d’un autre', AUTRUI],
        ['une demande sans auteur', null],
      ] as const) {
        const nom = `${roleLabel(role)} · ${statut.libelle} · ${quiLabel}`

        it(`${nom} — édition`, () => {
          const attendu = oracleDroitDi(role, statut.id, auteur, MOI)
          expect(
            canEditDemande(
              role,
              { created_by: auteur, statut_di_id: statut.id },
              MOI,
            ),
          ).toBe(attendu)
        })

        it(`${nom} — suppression`, () => {
          const attendu = oracleDroitDi(role, statut.id, auteur, MOI)
          expect(
            canDeleteDemande(
              role,
              { created_by: auteur, statut_di_id: statut.id },
              MOI,
            ),
          ).toBe(attendu)
        })
      }
    }
  }

  it('un demandeur SANS session (userId absent) n’édite ni ne supprime RIEN', () => {
    // Oracle : `di_demandeur_update` compare `created_by = auth.uid()` ; sans
    // identité, la comparaison ne peut pas réussir. Le front doit refuser au
    // lieu de comparer `created_by` à `undefined` (qui vaudrait vrai si la
    // demande n'avait pas d'auteur).
    for (const auteur of [MOI, AUTRUI, null]) {
      const di = { created_by: auteur, statut_di_id: 1 }
      expect(canEditDemande('demandeur', di, undefined)).toBe(false)
      expect(canDeleteDemande('demandeur', di, undefined)).toBe(false)
    }
  })

  it('édition et suppression restent équivalentes, quel que soit le cas', () => {
    // Oracle : « Logique identique à canEditDemande aujourd'hui, mais gardée
    // distincte ». Ce test documente l'équivalence : le jour où elle cesse
    // d'être vraie, il devient rouge et force à mettre à jour le commentaire
    // ET la policy correspondante.
    for (const role of ROLES) {
      for (const statutId of [1, 2, 3, 4, 0, -1]) {
        for (const auteur of [MOI, AUTRUI, null]) {
          for (const userId of [MOI, AUTRUI, undefined]) {
            const di = { created_by: auteur, statut_di_id: statutId }
            expect(canDeleteDemande(role, di, userId)).toBe(
              canEditDemande(role, di, userId),
            )
          }
        }
      }
    }
  })

  it('aucun statut non ouvert ne redonne la main au demandeur', () => {
    // Oracle : `statut_di_id = 1` EXACTEMENT. Un statut ajouté plus tard au
    // référentiel ne doit pas rouvrir le droit par accident.
    for (const statutId of [0, 2, 3, 4, 5, 99, -1, 1.0000001]) {
      expect(
        canEditDemande(
          'demandeur',
          { created_by: MOI, statut_di_id: statutId },
          MOI,
        ),
      ).toBe(false)
    }
    // Et le seul statut qui l'autorise reste le 1.
    expect(
      canEditDemande('demandeur', { created_by: MOI, statut_di_id: 1 }, MOI),
    ).toBe(true)
  })

  it('un rôle inconnu (ou renommé côté base) n’obtient AUCUN droit', () => {
    // Oracle : durcissement volontaire — « un rôle absent ne peut PAS créer ».
    // La même prudence doit valoir pour un rôle qu'on ne connaît pas.
    for (const role of [
      'root',
      'superadmin',
      'ADMIN',
      'admin ',
      'technicien2',
      '',
    ]) {
      const di = { created_by: MOI, statut_di_id: 1 }
      expect(canEditDemande(role, di, MOI)).toBe(false)
      expect(canDeleteDemande(role, di, MOI)).toBe(false)
    }
  })
})
