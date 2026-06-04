import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { LIBELLES_STATUT_OP, STATUTS_OP_SAISISSABLES } from '../schemas'
import { useUpdateOperationExecution } from '../mutations'
import { errorMessage } from '@/lib/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/database.types'

type OperationExecution =
  Database['public']['Tables']['operations_execution']['Row']

interface OperationRowProps {
  operation: OperationExecution
  otId: string
  executedBy: string
  readOnly: boolean
}

/** Une opération de type mesure a des seuils (min ou max). */
function estMesure(op: OperationExecution): boolean {
  return op.seuil_minimum !== null || op.seuil_maximum !== null
}

function formatSeuils(op: OperationExecution): string {
  const u = op.unite_symbole ?? op.unite_nom ?? ''
  const suffixe = u ? ` ${u}` : ''
  if (op.seuil_minimum !== null && op.seuil_maximum !== null) {
    return `${String(op.seuil_minimum)} – ${String(op.seuil_maximum)}${suffixe}`
  }
  if (op.seuil_minimum !== null)
    return `≥ ${String(op.seuil_minimum)}${suffixe}`
  if (op.seuil_maximum !== null)
    return `≤ ${String(op.seuil_maximum)}${suffixe}`
  return '—'
}

/**
 * Ligne d'opération éditable (saisie d'exécution). Édition locale + bouton
 * « Enregistrer » par ligne. La conformité est recalculée par le backend
 * (auto_calcul_conformite), on affiche est_conforme de la donnée serveur.
 */
export function OperationRow({
  operation,
  otId,
  executedBy,
  readOnly,
}: OperationRowProps) {
  const update = useUpdateOperationExecution()
  const mesure = estMesure(operation)

  const [statut, setStatut] = useState(operation.statut)
  const [valeur, setValeur] = useState(
    operation.valeur_mesuree !== null ? String(operation.valeur_mesuree) : '',
  )
  const [commentaires, setCommentaires] = useState(operation.commentaires ?? '')

  const dirty =
    statut !== operation.statut ||
    valeur !==
      (operation.valeur_mesuree !== null
        ? String(operation.valeur_mesuree)
        : '') ||
    commentaires !== (operation.commentaires ?? '')

  function handleSave() {
    const valeurMesuree = mesure && valeur.trim() !== '' ? Number(valeur) : null
    if (mesure && valeur.trim() !== '' && Number.isNaN(valeurMesuree)) {
      toast.error('Valeur mesurée invalide')
      return
    }
    update.mutate(
      {
        id: operation.id,
        otId,
        statut,
        valeurMesuree,
        dateExecution: operation.date_execution,
        executedBy,
        commentaires: commentaires.trim() || null,
      },
      {
        onSuccess: () => toast.success('Opération enregistrée'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  // Affichage conformité (donnée serveur, recalculée par trigger).
  // Tokens sémantiques uniquement : accent (primary) = conforme, destructive =
  // non conforme. Pas de couleur en dur (aucun token « success » dans le thème).
  const conformiteBadge =
    operation.est_conforme === null ? null : operation.est_conforme ? (
      <Badge variant="default">
        <Check /> Conforme
      </Badge>
    ) : (
      <Badge variant="destructive">
        <X /> Non conforme
      </Badge>
    )

  return (
    <div className="bg-card flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{operation.nom}</p>
          {operation.description && (
            <p className="text-muted-foreground text-xs whitespace-pre-wrap">
              {operation.description}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            {operation.type_operation}
            {mesure && ` · seuils : ${formatSeuils(operation)}`}
          </p>
        </div>
        {conformiteBadge}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(11rem,100%),1fr))] gap-3">
        {mesure && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">
              Valeur mesurée
              {operation.unite_symbole ? ` (${operation.unite_symbole})` : ''}
            </span>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              value={valeur}
              disabled={readOnly}
              onChange={(e) => setValeur(e.target.value)}
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Statut</span>
          <select
            value={statut}
            disabled={readOnly}
            onChange={(e) => setStatut(e.target.value)}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px] disabled:opacity-50"
          >
            {/* L'éventuel statut « annulee » système reste affiché en lecture. */}
            {!STATUTS_OP_SAISISSABLES.includes(
              statut as (typeof STATUTS_OP_SAISISSABLES)[number],
            ) && <option value={statut}>{LIBELLES_STATUT_OP[statut]}</option>}
            {STATUTS_OP_SAISISSABLES.map((s) => (
              <option key={s} value={s}>
                {LIBELLES_STATUT_OP[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Commentaire</span>
          <Input
            value={commentaires}
            disabled={readOnly}
            onChange={(e) => setCommentaires(e.target.value)}
          />
        </label>
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {operation.date_execution
              ? `Exécutée le ${new Date(operation.date_execution).toLocaleString('fr-FR')}`
              : 'Non exécutée'}
          </span>
          <Button
            size="sm"
            disabled={!dirty || update.isPending}
            onClick={handleSave}
          >
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      )}
    </div>
  )
}
