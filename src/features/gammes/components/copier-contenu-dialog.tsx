import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Categorie } from '@/features/categories/queries'
import type { GammeBiblioRow } from '../queries'
import { useCopierCategorie } from '../mutations'
import { exportErrorMessage } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { SelectDropdown } from '@/components/ui/select-dropdown'
import { Button } from '@/components/ui/button'
import { CheckRow } from '@/components/common/checklist-dialog'
import { CheckboxList } from '@/components/common/checkbox-list'
import { Label } from '@/components/ui/label'

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
      size="lg"
      onSubmit={() => void handleSubmit()}
      submitLabel="Copier"
      pendingLabel="Copie…"
      pending={copier.isPending}
      submitDisabled={siteCible === ''}
    >
      <div className="grid gap-2">
        <Label>Site cible *</Label>
        <SelectDropdown
          value={siteCible}
          onValueChange={setSiteCible}
          options={sites.map((s) => ({ value: s.id, label: s.nom }))}
          placeholder="— Choisir un site —"
          ariaLabel="Site cible"
        />
      </div>

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

      <CheckboxList bordered className="space-y-3">
        {isRoot ? (
          sousCats.length === 0 ? (
            <p className="text-sm text-muted-foreground">
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
                  {/* CheckRow (et non un label recomposé) : elle porte le lien
                      htmlFor/useId qui rend le libellé cliquable, et accepte
                      l'état indéterminé — c'est ce qui manquait autrefois et qui
                      avait justifié ces rangées artisanales. */}
                  <CheckRow
                    titre={sc.nom}
                    className="px-0 py-1 font-medium hover:bg-transparent"
                    checked={
                      selSous.has(sc.id)
                        ? true
                        : partiel
                          ? 'indeterminate'
                          : false
                    }
                    onToggle={() => toggleSous(sc.id)}
                  />
                  {gs.length > 0 && (
                    <div className="mt-1 space-y-1 pl-6">
                      {gs.map((g) => (
                        <CheckRow
                          key={g.id}
                          titre={g.nom}
                          className="px-0 py-1 text-muted-foreground hover:bg-transparent"
                          checked={selGammes.has(g.id)}
                          onToggle={() => toggleGamme(g.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )
        ) : (gammesDe.get(source?.id ?? '') ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cette sous-catégorie n’a aucune gamme.
          </p>
        ) : (
          <div className="space-y-1">
            {(gammesDe.get(source?.id ?? '') ?? []).map((g) => (
              <CheckRow
                key={g.id}
                titre={g.nom}
                className="px-0 py-1 hover:bg-transparent"
                checked={selGammes.has(g.id)}
                onToggle={() => toggleGamme(g.id)}
              />
            ))}
          </div>
        )}
      </CheckboxList>
    </FormDialog>
  )
}
