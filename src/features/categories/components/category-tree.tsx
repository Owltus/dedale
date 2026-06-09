import { useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Categorie } from '../queries'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const SCOPE_LABELS: Record<Categorie['scope'], string> = {
  equipement: 'Équipement',
  gamme: 'Gamme',
  mixte: 'Mixte',
}

interface CategoryTreeProps {
  categories: Categorie[]
  canManage: boolean
  /** Droit d'agir sur le scope entreprise (admin/manager). Les techs sont en
   * lecture seule sur les catégories entreprise. */
  canManageEntreprise: boolean
  onEdit: (categorie: Categorie) => void
  onAddChild: (parent: Categorie) => void
  onDelete: (categorie: Categorie) => void
}

/**
 * Affiche les catégories en arbre (domaines → familles) reconstruit à partir de
 * `parent_id`. Pas de lib externe : un composant récursif avec expand/collapse
 * local suffit pour la profondeur attendue du catalogue.
 */
export function CategoryTree({
  categories,
  canManage,
  canManageEntreprise,
  onEdit,
  onAddChild,
  onDelete,
}: CategoryTreeProps) {
  const childrenByParent = new Map<string, Categorie[]>()
  for (const categorie of categories) {
    if (!categorie.parent_id) continue
    const list = childrenByParent.get(categorie.parent_id) ?? []
    list.push(categorie)
    childrenByParent.set(categorie.parent_id, list)
  }
  // Racines : sans parent, ou parent hors du périmètre visible (par sécurité).
  const ids = new Set(categories.map((c) => c.id))
  const roots = categories.filter((c) => !c.parent_id || !ids.has(c.parent_id))

  return (
    <ul className="flex flex-col gap-1">
      {roots.map((categorie) => (
        <CategoryNode
          key={categorie.id}
          categorie={categorie}
          childrenByParent={childrenByParent}
          canManage={canManage}
          canManageEntreprise={canManageEntreprise}
          onEdit={onEdit}
          onAddChild={onAddChild}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

interface CategoryNodeProps {
  categorie: Categorie
  childrenByParent: Map<string, Categorie[]>
  canManage: boolean
  canManageEntreprise: boolean
  onEdit: (categorie: Categorie) => void
  onAddChild: (parent: Categorie) => void
  onDelete: (categorie: Categorie) => void
}

function CategoryNode({
  categorie,
  childrenByParent,
  canManage,
  canManageEntreprise,
  onEdit,
  onAddChild,
  onDelete,
}: CategoryNodeProps) {
  const children = childrenByParent.get(categorie.id) ?? []
  const hasChildren = children.length > 0
  const [open, setOpen] = useState(true)

  // Un tech ne peut éditer/supprimer que les catégories de site (pas entreprise).
  const canEditThis = canManageEntreprise || categorie.site_id !== null

  return (
    <li>
      <div className="group hover:bg-accent/50 flex items-center gap-2 rounded-md px-2 py-1.5">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label={open ? 'Replier' : 'Déplier'}
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        ) : (
          <span className="inline-block size-4 shrink-0" />
        )}

        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            !categorie.est_actif && 'text-muted-foreground line-through',
          )}
        >
          {categorie.nom}
        </span>

        <Badge variant="outline">{SCOPE_LABELS[categorie.scope]}</Badge>
        {categorie.site_id === null && (
          <Badge variant="secondary">Commun</Badge>
        )}

        {canManage && (
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddChild(categorie)}
              aria-label="Ajouter une sous-catégorie"
            >
              <Plus />
            </Button>
            {canEditThis && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(categorie)}
                  aria-label="Modifier la catégorie"
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(categorie)}
                  aria-label="Supprimer la catégorie"
                >
                  <Trash2 />
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {hasChildren && open && (
        <ul className="flex flex-col gap-1 pl-5">
          {children.map((child) => (
            <CategoryNode
              key={child.id}
              categorie={child}
              childrenByParent={childrenByParent}
              canManage={canManage}
              canManageEntreprise={canManageEntreprise}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
