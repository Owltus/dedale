import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { todayLocal } from '@/lib/date'
import { ValiderToutDialog } from './valider-tout-dialog'

/**
 * « Tout valider » (retour PO 27/11/2026) : la fenêtre annonce ce qui va partir,
 * propose aujourd'hui, et ne renvoie que la date — l'écriture est celle du
 * moteur de saisie (testée dans `use-operations-editor.dom.test.tsx`).
 */

function monter(props: Partial<Parameters<typeof ValiderToutDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  render(
    <ValiderToutDialog
      open
      onOpenChange={() => undefined}
      aFaire={54}
      mesuresRestantes={0}
      pending={false}
      onConfirm={onConfirm}
      {...props}
    />,
  )
  return { onConfirm }
}

describe('ValiderToutDialog', () => {
  // ORACLE : le nombre annoncé est celui qui partira.
  it('annonce le nombre d’opérations qui seront marquées faites', () => {
    monter()
    expect(
      screen.getByText(/Les 54 opérations à faire passeront « terminée »/),
    ).toBeTruthy()
  })

  // ORACLE (demande PO) : la date par défaut est aujourd'hui.
  it('valide à la date du jour par défaut', async () => {
    const utilisateur = userEvent.setup()
    const { onConfirm } = monter()
    await utilisateur.click(
      screen.getByRole('button', { name: 'Tout valider' }),
    )
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({
        date: todayLocal(),
        statut: 'terminee',
      }),
    )
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  // ORACLE : les mesures non touchées sont signalées, accordées au nombre.
  it('signale les mesures qui restent à saisir', () => {
    monter({ aFaire: 10, mesuresRestantes: 3 })
    expect(
      screen.getByText(/3 mesures restent à saisir à la main/),
    ).toBeTruthy()
  })

  it('ne parle pas de mesures quand il n’y en a pas', () => {
    monter()
    expect(screen.queryByText(/mesure/)).toBeNull()
  })
})
