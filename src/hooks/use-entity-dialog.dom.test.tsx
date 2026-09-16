import { describe, expect, it } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { useEntityDialog } from './use-entity-dialog'

/**
 * ORACLES de `useEntityDialog` (JSDoc du hook) :
 *  O1. `openCreate` ouvre SANS entité, `openEdit` ouvre AVEC ; `isEdit` en découle.
 *  O2. `onOpenChange`/`close` ne touchent QUE `open` : l'entité reste en place le
 *      temps de l'animation (pas de flash « Nouveau X » en fermeture).
 *  O3. `dialogKey` est une clé de REMONTAGE : elle change à chaque ouverture et
 *      entre deux entités, pour que le formulaire reparte des valeurs initiales.
 *  O4. Deux dialogs FRÈRES du même arbre n'ont JAMAIS la même clé, même fermés en
 *      mode création (régression : le 2e dialog ne s'ouvrait plus).
 */

interface Site {
  id: string
  nom: string
}
const mairie: Site = { id: 'site-1', nom: 'Mairie' }
const gymnase: Site = { id: 'site-2', nom: 'Gymnase' }

describe('useEntityDialog — modes création / édition (O1/O2)', () => {
  it('ouvre en création puis en édition, et garde l’entité à la fermeture', () => {
    const { result } = renderHook(() => useEntityDialog<Site>())
    expect(result.current.open).toBe(false)
    expect(result.current.entity).toBeNull()
    expect(result.current.isEdit).toBe(false)

    act(() => {
      result.current.openCreate()
    })
    expect(result.current.open).toBe(true)
    expect(result.current.entity).toBeNull()
    expect(result.current.isEdit).toBe(false)

    act(() => {
      result.current.openEdit(mairie)
    })
    expect(result.current.open).toBe(true)
    expect(result.current.entity).toBe(mairie)
    expect(result.current.isEdit).toBe(true)

    act(() => {
      result.current.close()
    })
    // O2 : fermé, mais l'entité survit à l'animation de sortie.
    expect(result.current.open).toBe(false)
    expect(result.current.entity).toBe(mairie)
    expect(result.current.isEdit).toBe(true)
  })

  it('openCreate après une édition remet l’entité à null (O1)', () => {
    const { result } = renderHook(() => useEntityDialog<Site>())
    act(() => {
      result.current.openEdit(mairie)
    })
    act(() => {
      result.current.close()
    })
    act(() => {
      result.current.openCreate()
    })
    expect(result.current.entity).toBeNull()
    expect(result.current.isEdit).toBe(false)
  })

  it('onOpenChange(false) équivaut à close (O2)', () => {
    const { result } = renderHook(() => useEntityDialog<Site>())
    act(() => {
      result.current.openEdit(mairie)
    })
    act(() => {
      result.current.onOpenChange(false)
    })
    expect(result.current.open).toBe(false)
    expect(result.current.entity).toBe(mairie)
  })
})

describe('useEntityDialog — clé de remontage (O3)', () => {
  it('change à chaque ouverture et entre deux entités', () => {
    const { result } = renderHook(() => useEntityDialog<Site>())
    const cleFermee = result.current.dialogKey

    act(() => {
      result.current.openCreate()
    })
    const cleCreation = result.current.dialogKey
    // O3 : ouvrir remonte le formulaire (sinon état rassis de la saisie précédente).
    expect(cleCreation).not.toBe(cleFermee)

    act(() => {
      result.current.openEdit(mairie)
    })
    const cleMairie = result.current.dialogKey
    expect(cleMairie).not.toBe(cleCreation)

    act(() => {
      result.current.openEdit(gymnase)
    })
    // O3 : deux entités différentes → deux formulaires différents.
    expect(result.current.dialogKey).not.toBe(cleMairie)

    act(() => {
      result.current.close()
    })
    act(() => {
      result.current.openEdit(gymnase)
    })
    // O3 : rouvrir la MÊME entité doit aussi remonter (saisie abandonnée perdue).
    expect(result.current.dialogKey).not.toBe(cleFermee)
  })
})

describe('useEntityDialog — deux dialogs frères (O4)', () => {
  it('donne deux clés DISTINCTES à deux instances du même arbre, même fermées', () => {
    function DeuxDialogs() {
      const edition = useEntityDialog<Site>()
      const sousEntite = useEntityDialog<Site>()
      return (
        <div data-testid="cles">{`${edition.dialogKey}|${sousEntite.dialogKey}`}</div>
      )
    }
    render(<DeuxDialogs />)
    const [a, b] = screen.getByTestId('cles').textContent.split('|')

    expect(a).toBeDefined()
    expect(b).toBeDefined()
    // O4 : sans identifiant d'instance, les deux valaient « new-false » et React
    // refusait de réconcilier deux enfants à clé identique.
    expect(a).not.toBe(b)
  })
})
