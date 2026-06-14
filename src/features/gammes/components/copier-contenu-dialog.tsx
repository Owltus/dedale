import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Categorie } from '@/features/categories/queries'
import type { GammeBiblioRow } from '../queries'
import { useCopierCategorie } from '../mutations'
import { exportErrorMessage } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { SelectField } from '@/components/common/select-field'
import { Button } from '@/components/ui/button'

interface CopierContenuDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Catégorie (racine) ou sous-catégorie à copier. */
  source: Categorie | null
  /** Sous-catégories ENFANTS DIRECTES de la source (si racine) ; sinon `[]`. */
  sousCats: Categorie[]
  /** Toutes les gammes communes (filtrées par `categorie_id` ici). */
  gammes: GammeBiblioRow[]
  /** Sites cibles accessibles. */
  sites: { id: string; nom: string }[]
}

/**
 * Copie « vers un site » d'un conteneur (catégorie ou sous-catégorie) avec
 * CONTRÔLE FIN : on choisit le conteneur seul, ou avec son contenu, en cochant
 * sous-catégories et gammes à inclure. Délègue à la RPC `copier_categorie` (merge
 * idempotent + scope arbitrés côté base).
 */
export function CopierContenuDialog({
  open,
  onOpenChange,
  source,
  sousCats,
  gammes,
  sites,
}: CopierContenuDialogProps) {
  const copier = useCopierCategorie()
  const isRoot = source !== null && source.parent_id === null

  // Gammes par sous-catégorie concernée (racine → ses enfants ; sous-cat → elle).
  const gammesDe = useMemo(() => {
    const map = new Map<string, GammeBiblioRow[]>()
    const cibles = isRoot
      ? sousCats.map((c) => c.id)
      : source
        ? [source.id]
        : []
    for (const cid of cibles) {
      map.set(
        cid,
        gammes.filter((g) => g.categorie_id === cid),
      )
    }
    return map
  }, [isRoot, sousCats, source, gammes])

  // Sélection par défaut : TOUT le contenu coché (l'utilisateur décoche au besoin).
  const [siteCible, setSiteCible] = useState('')
  const [selSous, setSelSous] = useState<Set<string>>(
    () => new Set(isRoot ? sousCats.map((c) => c.id) : []),
  )
  const [selGammes, setSelGammes] = useState<Set<string>>(
    () => new Set([...gammesDe.values()].flat().map((g) => g.id)),
  )

  function toggleSous(id: string) {
    const willBeOn = !selSous.has(id)
    const gIds = (gammesDe.get(id) ?? []).map((g) => g.id)
    setSelSous((prev) => {
      const n = new Set(prev)
      if (willBeOn) n.add(id)
      else n.delete(id)
      return n
    })
    // Cascade : (dé)cocher une sous-catégorie (dé)coche ses gammes.
    setSelGammes((prev) => {
      const n = new Set(prev)
      for (const gid of gIds) {
        if (willBeOn) n.add(gid)
        else n.delete(gid)
      }
      return n
    })
  }

  function toggleGamme(id: string) {
    const willBeOn = !selGammes.has(id)
    setSelGammes((prev) => {
      const n = new Set(prev)
      if (willBeOn) n.add(id)
      else n.delete(id)
      return n
    })
    // Cocher une gamme auto-matérialise sa sous-catégorie côté RPC → on coche
    // aussi la case parente pour le refléter. On ne la DÉCOCHE jamais
    // automatiquement : une sous-catégorie vide cochée reste un choix explicite
    // (feature `p_souscat_ids`).
    if (willBeOn) {
      const gamme = gammes.find((g) => g.id === id)
      if (gamme) {
        setSelSous((prev) => {
          if (prev.has(gamme.categorie_id)) return prev
          const n = new Set(prev)
          n.add(gamme.categorie_id)
          return n
        })
      }
    }
  }

  function setAll(on: boolean) {
    setSelSous(new Set(on && isRoot ? sousCats.map((c) => c.id) : []))
    setSelGammes(
      new Set(on ? [...gammesDe.values()].flat().map((g) => g.id) : []),
    )
  }

  async function handleSubmit() {
    if (!source || siteCible === '') return
    try {
      await copier.mutateAsync({
        sourceCategorieId: source.id,
        siteCible,
        sousCatIds: [...selSous],
        gammeIds: [...selGammes],
      })
      const nomSite = sites.find((s) => s.id === siteCible)?.nom
      toast.success(
        `« ${source.nom} » copiée sur ${
          nomSite ? `le site « ${nomSite} »` : 'le site'
        }. Retrouve le contenu dans la page Plan de maintenance du site.`,
      )
      onOpenChange(false)
    } catch (e) {
      toast.error(exportErrorMessage(e))
    }
  }

  const titre = source
    ? `Copier « ${source.nom} » vers un site`
    : 'Copier vers un site'

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={titre}
      description="Choisis le site cible et les parties à inclure (sous-catégories et gammes)."
      onSubmit={() => void handleSubmit()}
      submitLabel="Copier"
      pendingLabel="Copie…"
      pending={copier.isPending}
      submitDisabled={siteCible === ''}
    >
      <SelectField
        label="Site cible"
        value={siteCible}
        onChange={setSiteCible}
        required
      >
        <option value="" disabled>
          — Choisir un site —
        </option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nom}
          </option>
        ))}
      </SelectField>

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Contenu à copier</span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAll(true)}
          >
            Tout
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAll(false)}
          >
            Rien
          </Button>
        </div>
      </div>

      <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border p-3">
        {isRoot ? (
          sousCats.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Cette catégorie n’a aucune sous-catégorie.
            </p>
          ) : (
            sousCats.map((sc) => {
              const gs = gammesDe.get(sc.id) ?? []
              // Case parente « indéterminée » quand SEULE une partie de ses
              // gammes est cochée (ni toutes, ni aucune).
              const cochees = gs.filter((g) => selGammes.has(g.id)).length
              const partiel = cochees > 0 && cochees < gs.length
              return (
                <div key={sc.id}>
                  <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="accent-primary size-4 shrink-0"
                      checked={selSous.has(sc.id)}
                      ref={(el) => {
                        if (el) el.indeterminate = partiel
                      }}
                      onChange={() => toggleSous(sc.id)}
                    />
                    {sc.nom}
                  </label>
                  {gs.length > 0 && (
                    <div className="mt-1 space-y-1 pl-6">
                      {gs.map((g) => (
                        <label
                          key={g.id}
                          className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="accent-primary size-4 shrink-0"
                            checked={selGammes.has(g.id)}
                            onChange={() => toggleGamme(g.id)}
                          />
                          {g.nom}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )
        ) : (gammesDe.get(source?.id ?? '') ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Cette sous-catégorie n’a aucune gamme.
          </p>
        ) : (
          <div className="space-y-1">
            {(gammesDe.get(source?.id ?? '') ?? []).map((g) => (
              <label
                key={g.id}
                className="flex min-w-0 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="accent-primary size-4 shrink-0"
                  checked={selGammes.has(g.id)}
                  onChange={() => toggleGamme(g.id)}
                />
                {g.nom}
              </label>
            ))}
          </div>
        )}
      </div>
    </FormDialog>
  )
}
