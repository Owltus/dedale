import { useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DialogShell } from './dialog-shell'
import { FormDialog } from './form-dialog'
import { ConfirmDialog } from './confirm-dialog'
import { ConfirmDeleteDialog } from './confirm-delete-dialog'
import { Input } from '@/components/ui/input'

/**
 * MODALES communes. Trois promesses s'y jouent, dans cet ordre de gravité :
 *  - une soumission ne part jamais deux fois (doublon en base) ;
 *  - une suppression n'a lieu QUE sur le bouton de confirmation ;
 *  - la modale est atteignable et quittable au clavier.
 */

/** Promesse dont le test choisit le moment de résolution (pas de minuterie). */
function differe(): { promesse: Promise<void>; resoudre: () => void } {
  let resoudre!: () => void
  const promesse = new Promise<void>((r) => {
    resoudre = r
  })
  return { promesse, resoudre }
}

/* ------------------------------------------------------------------ */
/* DialogShell                                                         */
/* ------------------------------------------------------------------ */

describe('DialogShell', () => {
  // ORACLE : une modale fermée ne rend RIEN. Le projet a déjà connu des
  // « modales fantômes » (contenu monté alors que le dialog est fermé).
  it('fermée : aucun dialog dans le document', () => {
    render(
      <DialogShell
        open={false}
        onOpenChange={() => undefined}
        title="Nouvel équipement"
      >
        <p>corps</p>
      </DialogShell>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('corps')).toBeNull()
  })

  // ORACLE (accessibilité) : rôle `dialog` + nom accessible = le titre.
  it('ouverte : rôle dialog nommé par son titre', () => {
    render(
      <DialogShell
        open
        onOpenChange={() => undefined}
        title="Nouvel équipement"
      >
        <p>corps</p>
      </DialogShell>,
    )
    expect(
      screen.getByRole('dialog', { name: 'Nouvel équipement' }),
    ).toBeInTheDocument()
  })

  // ORACLE : documenté dans le composant — sans `description`, un descriptif
  // MASQUÉ est posé pour que le dialog garde un `aria-describedby` valide.
  it('sans description : le dialog reste décrit (aria-describedby résolu)', () => {
    render(
      <DialogShell
        open
        onOpenChange={() => undefined}
        title="Nouvel équipement"
      >
        <p>corps</p>
      </DialogShell>,
    )
    const dialog = screen.getByRole('dialog')
    const id = dialog.getAttribute('aria-describedby')
    expect(id).not.toBeNull()
    expect(document.getElementById(id ?? '')).not.toBeNull()
  })

  // ORACLE : la description fournie est affichée dans l'en-tête.
  it('avec description : elle est affichée et décrit le dialog', () => {
    render(
      <DialogShell
        open
        onOpenChange={() => undefined}
        title="Nouvel équipement"
        description="Nom, catégorie et localisation."
      >
        <p>corps</p>
      </DialogShell>,
    )
    const dialog = screen.getByRole('dialog')
    const id = dialog.getAttribute('aria-describedby')
    expect(document.getElementById(id ?? '')?.textContent).toBe(
      'Nom, catégorie et localisation.',
    )
  })

  // ORACLE : Échap ferme (comportement natif d'un dialog modal).
  it('Échap demande la fermeture', async () => {
    const utilisateur = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <DialogShell open onOpenChange={onOpenChange} title="Nouvel équipement">
        <p>corps</p>
      </DialogShell>,
    )

    await utilisateur.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  // ORACLE : le bouton de fermeture porte un nom accessible en français.
  it('expose un bouton « Fermer » qui demande la fermeture', async () => {
    const utilisateur = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <DialogShell open onOpenChange={onOpenChange} title="Nouvel équipement">
        <p>corps</p>
      </DialogShell>,
    )

    await utilisateur.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  // ORACLE : documenté — « Aucun corps rendu s'il est nul » / « Pied rendu
  // seulement s'il est fourni ».
  it('sans corps ni pied : ni l’un ni l’autre n’est rendu', () => {
    render(<DialogShell open onOpenChange={() => undefined} title="Vide" />)
    const dialog = screen.getByRole('dialog')
    // Le seul contrôle restant est la croix de fermeture de la coquille.
    const boutons = screen.getAllByRole('button')
    expect(boutons).toHaveLength(1)
    expect(boutons[0]).toHaveAccessibleName('Fermer')
    expect(dialog.textContent).toContain('Vide')
  })

  // ORACLE : `headerAction` est rendu dans l'en-tête.
  it('rend l’action d’en-tête fournie', () => {
    render(
      <DialogShell
        open
        onOpenChange={() => undefined}
        title="Aperçu"
        headerAction={<button type="button">Plein écran</button>}
      >
        <p>corps</p>
      </DialogShell>,
    )
    expect(
      screen.getByRole('button', { name: 'Plein écran' }),
    ).toBeInTheDocument()
  })

  /** Hôte minimal : un déclencheur externe qui pilote `open` (patron de l'app). */
  function HoteAvecDeclencheur() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Ouvrir
        </button>
        <DialogShell
          open={open}
          onOpenChange={setOpen}
          title="Nouvel équipement"
          footer={<button type="button">Valider</button>}
        >
          <Input aria-label="Nom" />
        </DialogShell>
      </>
    )
  }

  // ORACLE (accessibilité, WAI-ARIA « dialog » pattern) : à l'ouverture, le
  // focus ENTRE dans la modale — sinon la tabulation continue derrière elle.
  it('le focus entre dans la modale à l’ouverture', async () => {
    const utilisateur = userEvent.setup()
    render(<HoteAvecDeclencheur />)

    await utilisateur.click(screen.getByRole('button', { name: 'Ouvrir' }))

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
  })

  // ORACLE (accessibilité, WCAG 2.4.3 « Focus Order » + WAI-ARIA « dialog » :
  // « When the dialog closes, focus returns to the element that invoked it ») :
  // à la fermeture, le focus REVIENT au déclencheur. Sinon l'utilisateur au
  // clavier est renvoyé à `<body>`, donc au tout début de la page.
  //
  // BUG CANDIDAT Martin : attendu le focus sur le bouton « Ouvrir » après Échap
  // / observé le focus sur `<body>`. Cause : `DialogContent` en mode MODAL de
  // Radix fait `event.preventDefault()` sur `onCloseAutoFocus` (ce qui ANNULE la
  // restauration du FocusScope) puis focalise `context.triggerRef.current` —
  // référence renseignée par `<DialogTrigger>`. Or l'application n'utilise
  // JAMAIS `DialogTrigger` : toutes les modales sont pilotées par un `open`
  // contrôlé depuis un bouton externe. Le ref est donc toujours nul et le focus
  // n'est rendu à personne — sur TOUTES les modales de Dédale, pas seulement
  // celle-ci. Correctif possible côté `DialogShell` : mémoriser l'élément actif
  // à l'ouverture et le refocaliser via `onCloseAutoFocus`.
  it.fails('le focus revient au déclencheur à la fermeture', async () => {
    const utilisateur = userEvent.setup()
    render(<HoteAvecDeclencheur />)

    const declencheur = screen.getByRole('button', { name: 'Ouvrir' })
    await utilisateur.click(declencheur)
    await screen.findByRole('dialog')

    await utilisateur.keyboard('{Escape}')
    await waitFor(() => {
      expect(declencheur).toHaveFocus()
    })
  })
})

/* ------------------------------------------------------------------ */
/* FormDialog                                                          */
/* ------------------------------------------------------------------ */

describe('FormDialog', () => {
  // ORACLE : le bouton de validation porte le libellé demandé, et une
  // soumission = un appel.
  it('valide une fois par clic sur le bouton de validation', async () => {
    const utilisateur = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <FormDialog
        open
        onOpenChange={() => undefined}
        title="Nouvel équipement"
        onSubmit={onSubmit}
        submitLabel="Créer"
        pending={false}
      >
        <Input aria-label="Nom" />
      </FormDialog>,
    )

    await utilisateur.click(screen.getByRole('button', { name: 'Créer' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  // ORACLE : documenté — « Le corps + le pied sont enveloppés d'un <form>
  // (soumission au clavier) ». Entrée dans un champ doit valider.
  it('Entrée dans un champ soumet le formulaire une fois', async () => {
    const utilisateur = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <FormDialog
        open
        onOpenChange={() => undefined}
        title="Nouvel équipement"
        onSubmit={onSubmit}
        submitLabel="Créer"
        pending={false}
      >
        <Input aria-label="Nom" />
      </FormDialog>,
    )

    await utilisateur.type(screen.getByLabelText('Nom'), 'Chaufferie{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  // ORACLE : `pending` désactive la validation ET l'annulation — pendant
  // l'envoi, on ne peut ni renvoyer, ni fermer sous la mutation.
  it('pending : les deux boutons sont désactivés et le libellé d’attente s’affiche', () => {
    render(
      <FormDialog
        open
        onOpenChange={() => undefined}
        title="Nouvel équipement"
        onSubmit={() => undefined}
        submitLabel="Créer"
        pendingLabel="Enregistrement…"
        pending
      >
        <Input aria-label="Nom" />
      </FormDialog>,
    )

    expect(
      screen.getByRole('button', { name: 'Enregistrement…' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Créer' })).toBeNull()
  })

  // ORACLE : une soumission ne doit JAMAIS partir deux fois (doublon en base).
  // Prouvé avec une promesse que le test contrôle : tant qu'elle n'est pas
  // résolue, la modale reste `pending` et un second clic ne rappelle rien.
  it('double soumission impossible pendant l’envoi', async () => {
    const utilisateur = userEvent.setup()
    const { promesse, resoudre } = differe()
    const onSubmit = vi.fn(() => promesse)

    function Hote() {
      const [pending, setPending] = useState(false)
      return (
        <FormDialog
          open
          onOpenChange={() => undefined}
          title="Nouvel équipement"
          onSubmit={() => {
            setPending(true)
            void onSubmit().then(() => {
              setPending(false)
            })
          }}
          submitLabel="Créer"
          pendingLabel="Enregistrement…"
          pending={pending}
        >
          <Input aria-label="Nom" />
        </FormDialog>
      )
    }
    render(<Hote />)

    await utilisateur.click(screen.getByRole('button', { name: 'Créer' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)

    const enCours = await screen.findByRole('button', {
      name: 'Enregistrement…',
    })
    expect(enCours).toBeDisabled()

    // Second clic PENDANT l'envoi : aucun effet.
    await utilisateur.click(enCours)
    expect(onSubmit).toHaveBeenCalledTimes(1)

    // Même chose au clavier (Entrée soumet le <form>).
    await utilisateur.type(screen.getByLabelText('Nom'), '{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resoudre()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Créer' })).toBeEnabled()
    })
  })

  // ORACLE : `submitDisabled` désactive la validation hors envoi (champ requis
  // sans option possible).
  it('submitDisabled : la validation est impossible', async () => {
    const utilisateur = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <FormDialog
        open
        onOpenChange={() => undefined}
        title="Nouvel équipement"
        onSubmit={onSubmit}
        submitLabel="Créer"
        pending={false}
        submitDisabled
      >
        <Input aria-label="Nom" />
      </FormDialog>,
    )

    const bouton = screen.getByRole('button', { name: 'Créer' })
    expect(bouton).toBeDisabled()
    await utilisateur.click(bouton)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // ORACLE : « Annuler » ferme, et ne soumet JAMAIS (c'est un type="button").
  it('Annuler ferme sans soumettre', async () => {
    const utilisateur = userEvent.setup()
    const onSubmit = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <FormDialog
        open
        onOpenChange={onOpenChange}
        title="Nouvel équipement"
        onSubmit={onSubmit}
        submitLabel="Créer"
        pending={false}
      >
        <Input aria-label="Nom" />
      </FormDialog>,
    )

    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // ORACLE : documenté DANS le composant — un FormDialog IMBRIQUÉ reste un
  // enfant REACT du <form> parent, et React fait remonter « submit » le long de
  // l'arbre React, portail compris. Sans `stopPropagation`, valider le
  // sous-dialogue soumettait AUSSI le parent (saisie perdue). Régression déjà
  // vécue sur ce projet : on la verrouille.
  it('modale imbriquée : valider l’enfant ne soumet pas le parent', async () => {
    const utilisateur = userEvent.setup()
    const submitParent = vi.fn()
    const submitEnfant = vi.fn()

    render(
      <FormDialog
        open
        onOpenChange={() => undefined}
        title="Sous-catégorie"
        onSubmit={submitParent}
        submitLabel="Enregistrer"
        pending={false}
      >
        <Input aria-label="Nom de la sous-catégorie" />
        <FormDialog
          open
          onOpenChange={() => undefined}
          title="Ajouter une caractéristique"
          onSubmit={submitEnfant}
          submitLabel="Ajouter"
          pending={false}
        >
          <Input aria-label="Nom de la caractéristique" />
        </FormDialog>
      </FormDialog>,
    )

    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(submitEnfant).toHaveBeenCalledTimes(1)
    expect(submitParent).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ */
/* ConfirmDialog                                                       */
/* ------------------------------------------------------------------ */

describe('ConfirmDialog', () => {
  function rendreConfirmation(extra?: {
    onConfirm?: () => void
    onOpenChange?: (open: boolean) => void
    body?: ReactNode
    loading?: boolean
    confirmDisabled?: boolean
  }) {
    const onConfirm = extra?.onConfirm ?? vi.fn()
    const onOpenChange = extra?.onOpenChange ?? vi.fn()
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Réouvrir l’ordre de travail ?"
        description="Les opérations clôturées redeviendront modifiables."
        onConfirm={onConfirm}
        loading={extra?.loading}
        confirmDisabled={extra?.confirmDisabled}
        body={extra?.body}
      />,
    )
    return { onConfirm, onOpenChange }
  }

  // ORACLE : la confirmation est un dialog nommé par sa question.
  it('rend un dialog nommé par sa question', () => {
    rendreConfirmation()
    expect(
      screen.getByRole('dialog', { name: 'Réouvrir l’ordre de travail ?' }),
    ).toBeInTheDocument()
  })

  // ORACLE : seul le bouton de confirmation déclenche l'action.
  it('« Confirmer » appelle onConfirm exactement une fois', async () => {
    const utilisateur = userEvent.setup()
    const { onConfirm } = rendreConfirmation()
    await utilisateur.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  // ORACLE : annuler n'agit pas.
  it('« Annuler » ferme sans confirmer', async () => {
    const utilisateur = userEvent.setup()
    const { onConfirm, onOpenChange } = rendreConfirmation()
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // ORACLE : `loading` neutralise les deux boutons (pas de double action).
  it('loading : confirmation et annulation désactivées', async () => {
    const utilisateur = userEvent.setup()
    const { onConfirm } = rendreConfirmation({ loading: true })
    const bouton = screen.getByRole('button', { name: '…' })
    expect(bouton).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
    await utilisateur.click(bouton)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // ORACLE : `confirmDisabled` = « action interdite en l'état ».
  it('confirmDisabled : la confirmation n’agit pas', async () => {
    const utilisateur = userEvent.setup()
    const { onConfirm } = rendreConfirmation({ confirmDisabled: true })
    await utilisateur.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // ORACLE : `body` est rendu HORS du <p> de la description (mise en page libre).
  it('rend le bloc `body` fourni', () => {
    rendreConfirmation({ body: <Input aria-label="Motif" /> })
    expect(screen.getByLabelText('Motif')).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ */
/* ConfirmDeleteDialog                                                 */
/* ------------------------------------------------------------------ */

describe('ConfirmDeleteDialog — la suppression EXIGE la confirmation', () => {
  // ORACLE : la question nomme l'entité (« Supprimer la catégorie « CVC » ? »).
  it('le titre nomme l’entité à supprimer', () => {
    render(
      <ConfirmDeleteDialog
        open
        onOpenChange={() => undefined}
        entityLabel="la catégorie « CVC »"
        onConfirm={() => undefined}
      />,
    )
    expect(
      screen.getByRole('dialog', { name: 'Supprimer la catégorie « CVC » ?' }),
    ).toBeInTheDocument()
  })

  // ORACLE : suppression DÉFINITIVE (hard-delete) — seul le bouton de
  // confirmation la déclenche, et une seule fois.
  it('« Supprimer » appelle onConfirm exactement une fois', async () => {
    const utilisateur = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmDeleteDialog
        open
        onOpenChange={() => undefined}
        entityLabel="le prestataire"
        onConfirm={onConfirm}
      />,
    )

    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  // ORACLE : les trois sorties NON destructrices (Annuler, Fermer, Échap) ne
  // suppriment jamais.
  it.each([
    ['Annuler', 'Annuler'],
    ['Fermer', 'Fermer'],
  ])('« %s » ne supprime pas', async (_nom, bouton) => {
    const utilisateur = userEvent.setup()
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDeleteDialog
        open
        onOpenChange={onOpenChange}
        entityLabel="le prestataire"
        onConfirm={onConfirm}
      />,
    )

    await utilisateur.click(screen.getByRole('button', { name: bouton }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Échap ne supprime pas', async () => {
    const utilisateur = userEvent.setup()
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDeleteDialog
        open
        onOpenChange={onOpenChange}
        entityLabel="le prestataire"
        onConfirm={onConfirm}
      />,
    )

    await utilisateur.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // ORACLE : documenté — « Suppression INTERDITE : on affiche la raison et la
  // liste des éléments qui l'empêchent. Le bouton est désactivé. »
  it('blocked : raison affichée, impacts listés, suppression impossible', async () => {
    const utilisateur = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmDeleteDialog
        open
        onOpenChange={() => undefined}
        entityLabel="le local « Chaufferie »"
        blocked
        blockedReason="Ce local contient encore 2 équipements."
        impactsTitle="Équipements bloquants :"
        impacts={['Chaudière A', 'Pompe B']}
        onConfirm={onConfirm}
      />,
    )

    expect(
      screen.getByText('Ce local contient encore 2 équipements.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Équipements bloquants :')).toBeInTheDocument()
    expect(screen.getByText('• Chaudière A')).toBeInTheDocument()

    const bouton = screen.getByRole('button', { name: 'Supprimer' })
    expect(bouton).toBeDisabled()
    await utilisateur.click(bouton)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // ORACLE : documenté — tant que les éléments liés se chargent, on ne sait pas
  // si la suppression est permise : elle doit rester impossible.
  it('loadingImpacts : suppression impossible tant que la vérification court', async () => {
    const utilisateur = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmDeleteDialog
        open
        onOpenChange={() => undefined}
        entityLabel="la vignette"
        loadingImpacts
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByText('Vérification des éléments liés…')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeDisabled()
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // ORACLE : documenté — « Éléments liés, affichés en liste (tronquée à 5 +
  // « et N autre(s) ») ». L'accord du pluriel fait partie de la promesse.
  it('plus de 5 impacts : liste tronquée à 5 et reste compté au pluriel', () => {
    render(
      <ConfirmDeleteDialog
        open
        onOpenChange={() => undefined}
        entityLabel="la vignette"
        impacts={['A', 'B', 'C', 'D', 'E', 'F', 'G']}
        onConfirm={() => undefined}
      />,
    )
    expect(screen.getByText('• E')).toBeInTheDocument()
    expect(screen.queryByText('• F')).toBeNull()
    expect(screen.getByText('• et 2 autres')).toBeInTheDocument()
  })

  it('exactement 6 impacts : « et 1 autre » au singulier', () => {
    render(
      <ConfirmDeleteDialog
        open
        onOpenChange={() => undefined}
        entityLabel="la vignette"
        impacts={['A', 'B', 'C', 'D', 'E', 'F']}
        onConfirm={() => undefined}
      />,
    )
    expect(screen.getByText('• et 1 autre')).toBeInTheDocument()
  })

  // ORACLE : documenté — `confirmPhrase` « exige de SAISIR exactement ce texte
  // pour activer le bouton ». C'est le garde-fou des suppressions en cascade.
  it('confirmPhrase : suppression impossible tant que la phrase n’est pas exacte', async () => {
    const utilisateur = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmDeleteDialog
        open
        onOpenChange={() => undefined}
        entityLabel="le site « Siège »"
        confirmPhrase="Siège"
        onConfirm={onConfirm}
      />,
    )

    const bouton = screen.getByRole('button', { name: 'Supprimer' })
    expect(bouton).toBeDisabled()

    // Le champ de confirmation a un LIBELLÉ associé (accessibilité).
    const champ = screen.getByLabelText(/Pour confirmer, saisis/)
    await utilisateur.type(champ, 'Siege')
    expect(bouton).toBeDisabled()
    await utilisateur.click(bouton)
    expect(onConfirm).not.toHaveBeenCalled()

    await utilisateur.clear(champ)
    await utilisateur.type(champ, 'Siège')
    await waitFor(() => {
      expect(bouton).toBeEnabled()
    })
    await utilisateur.click(bouton)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  // ORACLE : documenté — le champ est « réinitialisé à chaque FERMETURE (toutes
  // voies, y compris après confirmation) → réouverture toujours vierge ». Sinon
  // la phrase resterait saisie et la suppression suivante partirait d'un clic.
  it('réouverture : le champ de confirmation est vierge', async () => {
    const utilisateur = userEvent.setup()
    function Hote() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Rouvrir
          </button>
          <ConfirmDeleteDialog
            open={open}
            onOpenChange={setOpen}
            entityLabel="le site « Siège »"
            confirmPhrase="Siège"
            onConfirm={() => setOpen(false)}
          />
        </>
      )
    }
    render(<Hote />)

    await utilisateur.type(
      screen.getByLabelText(/Pour confirmer, saisis/),
      'Siège',
    )
    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    await utilisateur.click(screen.getByRole('button', { name: 'Rouvrir' }))

    expect(await screen.findByLabelText(/Pour confirmer, saisis/)).toHaveValue(
      '',
    )
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeDisabled()
  })

  // ORACLE : documenté — `blocked` est « prioritaire sur warning (un blocage n'a
  // pas besoin d'avertissement) », et le champ de saisie n'est affiché que si
  // l'action est réellement possible.
  it('blocked : ni avertissement, ni champ de confirmation', () => {
    render(
      <ConfirmDeleteDialog
        open
        onOpenChange={() => undefined}
        entityLabel="le local"
        blocked
        blockedReason="Local non vide."
        warning="Les liaisons seront retirées."
        confirmPhrase="Chaufferie"
        onConfirm={() => undefined}
      />,
    )
    expect(screen.queryByText('Les liaisons seront retirées.')).toBeNull()
    expect(screen.queryByLabelText(/Pour confirmer, saisis/)).toBeNull()
  })

  // ORACLE : suppression PERMISE malgré des impacts → l'avertissement est
  // affiché (doctrine : CASCADE « le dire dans le warning de la modale »).
  it('non bloquée : l’avertissement de cascade est affiché', () => {
    render(
      <ConfirmDeleteDialog
        open
        onOpenChange={() => undefined}
        entityLabel="la gamme"
        warning="Les liaisons aux équipements seront retirées."
        onConfirm={() => undefined}
      />,
    )
    expect(
      screen.getByText('Les liaisons aux équipements seront retirées.'),
    ).toBeInTheDocument()
  })
})
