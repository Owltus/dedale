import { useId } from 'react'
import {
  estDoubleReference,
  type Champ,
  type ChampValeur,
  type DoubleReference,
} from '@/lib/champs'
import { cn } from '@/lib/utils'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { SelectDropdown, SELECT_AUCUN } from '@/components/ui/select-dropdown'

interface ChampValeurInputProps {
  champ: Champ
  value: ChampValeur
  onChange: (value: ChampValeur) => void
  error?: string
}

/**
 * Libellé + widget + message d'erreur, gabarit commun aux CINQ types — aucune
 * branche ne compose son libellé à la main, c'est ainsi qu'un type (`date`)
 * avait fini par n'en afficher aucun.
 *
 * `inline` = disposition de la CASE À COCHER (widget à gauche, libellé à droite
 * sur la même ligne, libellé non gras), reprise telle quelle de `CheckboxField`.
 * Tout le reste — `htmlFor`, astérisque « requis », message d'erreur — est
 * strictement identique aux quatre autres types.
 */
function Enveloppe({
  fieldId,
  label,
  required,
  error,
  inline = false,
  children,
}: {
  fieldId: string
  label: string
  required?: boolean
  error?: string
  inline?: boolean
  children: React.ReactNode
}) {
  const libelle = (
    <Label htmlFor={fieldId} className={cn(inline && 'font-normal')}>
      {label}
      {required ? ' *' : ''}
    </Label>
  )
  return (
    <div className="grid gap-2">
      {inline ? (
        <div className="flex items-center gap-2">
          {children}
          {libelle}
        </div>
      ) : (
        <>
          {libelle}
          {children}
        </>
      )}
      {error != null && error !== '' && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}

/**
 * Saisie d'une valeur de champ, avec le widget adapté à son `type`
 * (texte / nombre / date / oui-non / liste). Le libellé = `champ.cle`.
 *
 * API IMPÉRATIVE (`value`/`onChange`) et non react-hook-form : le type du champ
 * n'est connu qu'à l'exécution, et l'hôte est un éditeur de liste qui gère
 * lui-même son état. Les champs de `common/fields/` (branchés sur
 * `control`+`name`) ne conviennent donc pas ici — on compose directement sur
 * les primitives `ui/`, plutôt que de maintenir en vie une seconde génération
 * de composants de champ pour ce seul cas.
 */
export function ChampValeurInput({
  champ,
  value,
  onChange,
  error,
}: ChampValeurInputProps) {
  const fieldId = useId()
  const label = champ.cle

  switch (champ.type) {
    case 'nombre':
      return (
        <Enveloppe
          fieldId={fieldId}
          label={label}
          required={champ.requis}
          error={error}
        >
          <div className="flex items-center gap-2">
            <Input
              id={fieldId}
              type="number"
              step="any"
              value={typeof value === 'number' ? value : ''}
              onChange={(e) => {
                if (e.target.value === '') {
                  onChange(null)
                  return
                }
                const n = Number(e.target.value)
                onChange(Number.isNaN(n) ? null : n)
              }}
              aria-invalid={error != null && error !== ''}
            />
            {champ.unite != null && champ.unite !== '' && (
              <span className="shrink-0 text-sm text-muted-foreground">
                {champ.unite}
              </span>
            )}
          </div>
        </Enveloppe>
      )

    case 'date':
      return (
        <Enveloppe
          fieldId={fieldId}
          label={label}
          required={champ.requis}
          error={error}
        >
          <DateField
            id={fieldId}
            value={typeof value === 'string' ? value : ''}
            onValueChange={(v) => onChange(v || null)}
            ariaLabel={label}
            aria-invalid={error != null && error !== ''}
            className="w-full"
          />
        </Enveloppe>
      )

    case 'oui-non':
      return (
        <Enveloppe
          fieldId={fieldId}
          label={label}
          required={champ.requis}
          error={error}
          inline
        >
          <Checkbox
            id={fieldId}
            checked={value === true}
            onCheckedChange={(c) => onChange(c === true)}
            aria-invalid={error != null && error !== ''}
          />
        </Enveloppe>
      )

    case 'double-reference': {
      // Deux cases CÔTE À CÔTE, séparées par le « / » qu'on retrouvera à la
      // lecture : la saisie ressemble au résultat. Les deux parts se remplissent
      // d'un geste, sans quitter la ligne.
      const v: DoubleReference = estDoubleReference(value)
        ? value
        : { a: '', b: '' }
      const libelleA = champ.libelleA?.trim() ?? ''
      const libelleB = champ.libelleB?.trim() ?? ''
      // `aria-label` COMPLET sur chaque case : au lecteur d'écran, « Zone » seul
      // ne dit pas de quelle caractéristique il s'agit quand la fiche en aligne
      // plusieurs. Le libellé visible, lui, reste court.
      //
      // Quand une part n'est pas nommée, on la désigne par sa POSITION plutôt
      // que de retomber sur le nom du champ : la case porterait alors le même
      // nom que le groupe, et le lecteur d'écran annoncerait deux fois « ZDM »
      // sans dire laquelle est laquelle.
      const nomCase = (libelle: string, position: string) =>
        `${label} — ${libelle === '' ? position : libelle}`
      return (
        <Enveloppe
          fieldId={`${fieldId}-a`}
          label={label}
          required={champ.requis}
          error={error}
        >
          <div className="flex items-end gap-2">
            <div className="grid min-w-0 flex-1 gap-1">
              {libelleA !== '' && (
                <Label
                  htmlFor={`${fieldId}-a`}
                  className="text-xs font-normal text-muted-foreground"
                >
                  {libelleA}
                </Label>
              )}
              <Input
                id={`${fieldId}-a`}
                value={v.a}
                onChange={(e) => onChange({ ...v, a: e.target.value })}
                aria-label={nomCase(libelleA, '1re partie')}
                aria-invalid={error != null && error !== ''}
              />
            </div>
            {/* Séparateur DÉCORATIF : l'information est déjà portée par les deux
                libellés et les aria-label — le lecteur d'écran n'a pas à l'ânonner. */}
            <span
              aria-hidden="true"
              className="pb-2 text-sm text-muted-foreground"
            >
              /
            </span>
            <div className="grid min-w-0 flex-1 gap-1">
              {libelleB !== '' && (
                <Label
                  htmlFor={`${fieldId}-b`}
                  className="text-xs font-normal text-muted-foreground"
                >
                  {libelleB}
                </Label>
              )}
              <Input
                id={`${fieldId}-b`}
                value={v.b}
                onChange={(e) => onChange({ ...v, b: e.target.value })}
                aria-label={nomCase(libelleB, '2de partie')}
                aria-invalid={error != null && error !== ''}
              />
            </div>
          </div>
        </Enveloppe>
      )
    }

    case 'liste':
      return (
        <Enveloppe
          fieldId={fieldId}
          label={label}
          required={champ.requis}
          error={error}
        >
          <SelectDropdown
            id={fieldId}
            value={typeof value === 'string' ? value : ''}
            onValueChange={(v) =>
              onChange(v === SELECT_AUCUN || v === '' ? null : v)
            }
            // Champ FACULTATIF → option neutre réellement SÉLECTIONNABLE : un
            // placeholder ne l'est pas, et une valeur choisie par erreur ne
            // pourrait alors plus être retirée depuis l'écran.
            options={[
              ...(champ.requis
                ? []
                : [{ value: SELECT_AUCUN, label: '— Aucun —' }]),
              ...(champ.options ?? []).map((o) => ({ value: o, label: o })),
            ]}
            placeholder="— Choisir —"
            ariaLabel={label}
            aria-invalid={error != null && error !== ''}
          />
        </Enveloppe>
      )

    default:
      return (
        <Enveloppe
          fieldId={fieldId}
          label={label}
          required={champ.requis}
          error={error}
        >
          <Input
            id={fieldId}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value || null)}
            aria-invalid={error != null && error !== ''}
          />
        </Enveloppe>
      )
  }
}
