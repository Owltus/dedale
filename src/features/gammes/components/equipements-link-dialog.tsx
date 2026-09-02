import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Package,
} from 'lucide-react'
import { useSyncGammeEquipements } from '../mutations'
import { equipementsQueries } from '@/features/equipements/queries'
import { categoriesQueries } from '@/features/categories/queries'
import { titreAffiche, secondaireAffiche } from '@/features/equipements/format'
import { writeErrorMessage } from '@/lib/form'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckboxList } from '@/components/common/checkbox-list'
import { DialogShell } from '@/components/common/dialog-shell'
import { SearchInput } from '@/components/common/search-input'
import type { Database } from '@/lib/database.types'

type Equipement = Database['public']['Views']['v_equipements_complet']['Row']

interface EquipementsLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  gammeId: string
  /** Ids des équipements actuellement liés (état de référence pour le diff). */
  current: string[]
}

interface SousCatNode {
  id: string
  nom: string
  equipements: Equipement[]
}
interface CatNode {
  id: string
  nom: string
  sousCategories: SousCatNode[]
}

const idsDe = (equipements: Equipement[]): string[] =>
  equipements.map((e) => e.id).filter((id): id is string => id !== null)
const idsDeCat = (cat: CatNode): string[] =>
  cat.sousCategories.flatMap((sc) => idsDe(sc.equipements))

/** État agrégé (coché / vide / partiel) d'un groupe, dérivé de la sélection réelle. */
function etatGroupe(
  ids: string[],
  selected: Set<string>,
): boolean | 'indeterminate' {
  if (ids.length === 0) return false
  const n = ids.filter((id) => selected.has(id)).length
  if (n === 0) return false
  return n === ids.length ? true : 'indeterminate'
}

/**
 * Arbre catégorie → sous-catégorie → équipements du site (scope 'parc'),
 * réduit aux branches qui portent au moins un équipement — même construction
 * que `EquipementsExplorer`, mais aplatie en arbre plutôt qu'en drill par URL.
 */
function useArbreEquipements(siteId: string) {
  const { data: categories = [] } = useQuery(categoriesQueries.pool())
  const { data: equipements = [] } = useQuery(equipementsQueries.list(siteId))

  return useMemo(() => {
    const parcCats = categories.filter(
      (c) => c.scope === 'parc' && c.site_id === siteId && c.est_actif,
    )
    const parSousCat = new Map<string, Equipement[]>()
    for (const e of equipements) {
      if (!e.categorie_id) continue
      const arr = parSousCat.get(e.categorie_id) ?? []
      arr.push(e)
      parSousCat.set(e.categorie_id, arr)
    }
    for (const arr of parSousCat.values()) {
      arr.sort((a, b) =>
        titreAffiche(a).localeCompare(titreAffiche(b), undefined, {
          numeric: true,
        }),
      )
    }
    const sousCatsByParent = new Map<string, typeof parcCats>()
    for (const c of parcCats) {
      if (c.parent_id === null) continue
      const arr = sousCatsByParent.get(c.parent_id) ?? []
      arr.push(c)
      sousCatsByParent.set(c.parent_id, arr)
    }
    const arbre: CatNode[] = []
    for (const racine of parcCats.filter((c) => c.parent_id === null)) {
      const sousCategories = (sousCatsByParent.get(racine.id) ?? [])
        .map((sc): SousCatNode | null => {
          const eqs = parSousCat.get(sc.id) ?? []
          return eqs.length > 0
            ? { id: sc.id, nom: sc.nom, equipements: eqs }
            : null
        })
        .filter((x): x is SousCatNode => x !== null)
      if (sousCategories.length > 0) {
        arbre.push({ id: racine.id, nom: racine.nom, sousCategories })
      }
    }
    return arbre
  }, [categories, equipements, siteId])
}

/** Rangée cochable À TIROIR (chevron facultatif) — sous-brique locale : `CheckRow`
 * n'a pas de préfixe dépliant, et un arbre à 3 niveaux ne justifie pas d'en
 * ajouter un au composant partagé (2 autres consommateurs, usage plat). */
function RangeeArbre({
  icon,
  titre,
  meta,
  checked,
  onToggle,
  expandable,
  expanded,
  onToggleExpand,
  niveau,
}: {
  icon: React.ReactNode
  titre: string
  meta?: string | null
  checked: boolean | 'indeterminate'
  onToggle: () => void
  expandable: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  niveau: 0 | 1 | 2
}) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-md py-1.5 pr-3 text-sm hover:bg-muted/50"
      style={{ paddingLeft: `${(0.5 + niveau * 1.25).toString()}rem` }}
    >
      {expandable ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label={expanded ? 'Replier' : 'Déplier'}
        >
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
      ) : (
        <span className="size-5 shrink-0" />
      )}
      <Checkbox
        checked={checked}
        onCheckedChange={() => onToggle()}
        className="shrink-0"
      />
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{titre}</span>
        {meta && (
          <span className="shrink-0 truncate text-xs text-muted-foreground">
            {meta}
          </span>
        )}
      </button>
    </div>
  )
}

/**
 * Liaison gamme ↔ équipements EN ARBORESCENCE (catégorie → sous-catégorie →
 * équipements), comme un explorateur de fichiers : cocher une sous-catégorie
 * (ou une catégorie entière) sélectionne tous ses équipements d'un coup ; on
 * peut aussi déplier et cocher des équipements un par un. La case d'un groupe
 * reflète l'état RÉEL de ses équipements (coché / vide / partiel) — cocher un
 * groupe ne fait qu'ajouter/retirer ses équipements de la sélection, rien
 * n'est stocké au niveau catégorie (le lien reste toujours équipement ↔ gamme).
 */
export function EquipementsLinkDialog({
  open,
  onOpenChange,
  siteId,
  gammeId,
  current,
}: EquipementsLinkDialogProps) {
  const sync = useSyncGammeEquipements()
  const arbre = useArbreEquipements(siteId)

  const [selected, setSelected] = useState<Set<string>>(() => new Set(current))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  // Réamorçage à la transition fermé → ouvert (même patron que ChecklistDialog) :
  // sélection = liens actuels, recherche vidée, PLUS on déplie les branches qui
  // portent déjà un équipement lié — la sélection existante doit être visible
  // sans manipulation à l'ouverture.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSelected(new Set(current))
      setSearch('')
      const aDeplier = new Set<string>()
      for (const cat of arbre) {
        let unDansCat = false
        for (const sc of cat.sousCategories) {
          const unDansSc = sc.equipements.some(
            (e) => e.id && current.includes(e.id),
          )
          if (unDansSc) {
            aDeplier.add(sc.id)
            unDansCat = true
          }
        }
        if (unDansCat) aDeplier.add(cat.id)
      }
      setExpanded(aDeplier)
    }
  }

  const q = search.trim().toLowerCase()
  const arbreFiltre = useMemo(() => {
    if (q === '') return arbre
    return arbre
      .map((cat): CatNode | null => {
        const sousCategories = cat.sousCategories
          .map((sc): SousCatNode | null => {
            const equipements = sc.equipements.filter(
              (e) =>
                titreAffiche(e).toLowerCase().includes(q) ||
                (secondaireAffiche(e) ?? '').toLowerCase().includes(q),
            )
            return equipements.length > 0 ? { ...sc, equipements } : null
          })
          .filter((x): x is SousCatNode => x !== null)
        return sousCategories.length > 0 ? { ...cat, sousCategories } : null
      })
      .filter((x): x is CatNode => x !== null)
  }, [arbre, q])
  // En recherche, tout ce qui reste dans l'arbre filtré est déjà pertinent :
  // on force le dépliage plutôt que de laisser l'utilisateur rouvrir chaque
  // branche à la main pour voir un résultat qu'il vient de trouver.
  const estDeplie = (id: string) => q !== '' || expanded.has(id)
  const toggleDeplier = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleGroupe = (ids: string[], etat: boolean | 'indeterminate') =>
    setSelected((prev) => {
      const next = new Set(prev)
      const coche = etat !== true
      for (const id of ids) {
        if (coche) next.add(id)
        else next.delete(id)
      }
      return next
    })
  const toggleFeuille = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function handleSubmit() {
    try {
      await sync.mutateAsync({ gammeId, current, selected: [...selected] })
      toast.success('Équipements liés mis à jour')
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Lier des équipements"
      description="Coche une sous-catégorie entière, ou déplie-la pour choisir des équipements précis."
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sync.isPending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={sync.isPending}
          >
            {sync.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Rechercher un équipement…"
        autoFocus
      />
      <CheckboxList bordered>
        {arbreFiltre.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {arbre.length === 0 ? 'Aucun équipement.' : 'Aucun résultat.'}
          </p>
        ) : (
          <div className={cn(q === '' && 'divide-y')}>
            {arbreFiltre.map((cat) => {
              const catIds = idsDeCat(cat)
              const catState = etatGroupe(catIds, selected)
              return (
                <div key={cat.id}>
                  <RangeeArbre
                    icon={
                      estDeplie(cat.id) ? (
                        <FolderOpen className="size-4" />
                      ) : (
                        <Folder className="size-4" />
                      )
                    }
                    titre={cat.nom}
                    checked={catState}
                    onToggle={() => toggleGroupe(catIds, catState)}
                    expandable
                    expanded={estDeplie(cat.id)}
                    onToggleExpand={() => toggleDeplier(cat.id)}
                    niveau={0}
                  />
                  {estDeplie(cat.id) &&
                    cat.sousCategories.map((sc) => {
                      const scIds = idsDe(sc.equipements)
                      const scState = etatGroupe(scIds, selected)
                      return (
                        <div key={sc.id}>
                          <RangeeArbre
                            icon={
                              estDeplie(sc.id) ? (
                                <FolderOpen className="size-4" />
                              ) : (
                                <Folder className="size-4" />
                              )
                            }
                            titre={sc.nom}
                            meta={`${String(sc.equipements.length)} équip.`}
                            checked={scState}
                            onToggle={() => toggleGroupe(scIds, scState)}
                            expandable
                            expanded={estDeplie(sc.id)}
                            onToggleExpand={() => toggleDeplier(sc.id)}
                            niveau={1}
                          />
                          {estDeplie(sc.id) &&
                            sc.equipements.map((e) => (
                              <RangeeArbre
                                key={e.id}
                                icon={<Package className="size-4" />}
                                titre={titreAffiche(e)}
                                meta={secondaireAffiche(e)}
                                checked={e.id !== null && selected.has(e.id)}
                                onToggle={() => e.id && toggleFeuille(e.id)}
                                expandable={false}
                                niveau={2}
                              />
                            ))}
                        </div>
                      )
                    })}
                </div>
              )
            })}
          </div>
        )}
      </CheckboxList>
    </DialogShell>
  )
}
