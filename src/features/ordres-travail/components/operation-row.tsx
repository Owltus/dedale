import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { LIBELLES_STATUT_OP, STATUTS_OP_SAISISSABLES } from '../schemas'
import { useUpdateOperationExecution } from '../mutations'
import { writeErrorMessage } from '@/lib/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/database.types'

type OperationExecution =
  Database['public']['Tables']['operations_execution']['Row']

interface OperationRowProps {
  operation: OperationExecution
  otId: string
  executedBy: string
  /**
   * Mode LECTURE (OT clôturé/annulé, ou rôle sans droit) : on AFFICHE les données
   * enregistrées (preuve légale) au lieu d'un formulaire désactivé. Sinon : SAISIE.
   */
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
 * Ligne d'opération à DEUX modes :
 * - SAISIE (OT actif, droit d'écriture) : édition locale + bouton « Enregistrer ».
 * - LECTURE (OT clôturé/annulé = preuve légale, ou rôle lecteur) : affichage des
 *   données enregistrées (valeur mesurée, statut, commentaire, date d'exécution),
 *   et non un formulaire grisé — pour qu'elles restent lisibles.
 * La conformité est recalculée par le backend (auto_calcul_conformite) ; on
 * affiche `est_conforme` de la donnée serveur dans les deux modes.
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
        onError: (e) => toast.error(writeErrorMessage(e)),
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

  // Date d'exécution — visible dans LES DEUX modes (en lecture, c'est l'info
  // « quand ça a été fait » ; auparavant masquée hors saisie).
  const dateExecution = (
    <span className="text-muted-foreground text-xs">
      {operation.date_execution
        ? `Exécutée le ${new Date(operation.date_execution).toLocaleString('fr-FR')}`
        : 'Non exécutée'}
    </span>
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

      {readOnly ? (
        // ── Mode LECTURE : données enregistrées (preuve légale) ────────────────
        <>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(11rem,100%),1fr))] gap-3 text-xs">
            {mesure && (
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">
                  Valeur mesurée
                  {operation.unite_symbole
                    ? ` (${operation.unite_symbole})`
                    : ''}
                </dt>
                <dd className="text-sm">
                  {operation.valeur_mesuree !== null
                    ? String(operation.valeur_mesuree)
                    : '—'}
                </dd>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Statut</dt>
              <dd className="text-sm">
                {LIBELLES_STATUT_OP[operation.statut] ?? operation.statut}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Commentaire</dt>
              <dd className="text-sm whitespace-pre-wrap">
                {operation.commentaires?.trim() ? operation.commentaires : '—'}
              </dd>
            </div>
          </dl>
          {dateExecution}
        </>
      ) : (
        // ── Mode SAISIE : édition de l'exécution ───────────────────────────────
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(11rem,100%),1fr))] gap-3">
            {mesure && (
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">
                  Valeur mesurée
                  {operation.unite_symbole
                    ? ` (${operation.unite_symbole})`
                    : ''}
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={valeur}
                  onChange={(e) => setValeur(e.target.value)}
                />
              </label>
            )}

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Statut</span>
              <Select
                value={statut}
                onChange={(e) => setStatut(e.target.value)}
                className="w-auto"
              >
                {/* L'éventuel statut « annulee » système reste affiché en lecture. */}
                {!STATUTS_OP_SAISISSABLES.includes(
                  statut as (typeof STATUTS_OP_SAISISSABLES)[number],
                ) && (
                  <option value={statut}>{LIBELLES_STATUT_OP[statut]}</option>
                )}
                {STATUTS_OP_SAISISSABLES.map((s) => (
                  <option key={s} value={s}>
                    {LIBELLES_STATUT_OP[s]}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Commentaire</span>
              <Input
                value={commentaires}
                onChange={(e) => setCommentaires(e.target.value)}
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-2">
            {dateExecution}
            <Button
              size="sm"
              disabled={!dirty || update.isPending}
              onClick={handleSave}
            >
              {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
