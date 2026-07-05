import { type ReactNode } from 'react'
import { Replace } from 'lucide-react'
import { ChampNombreUnite } from './champ-nombre-unite'
import type { OperationEdit } from './operation-row'

interface ChangementCompteurPanelProps {
  /** Valeurs éditables (état CONTRÔLÉ par le parent). */
  value: OperationEdit
  onChange: (value: OperationEdit) => void
  /** Unité affichée (symbole ou nom), '' si aucune. */
  unite: string
  /** Dernier relevé connu (base du calcul de l'écart), null si introuvable. */
  previousValue?: number | null
  /** Consommation calculée (replacement-aware), null si indéterminée. */
  conso: number | null
  /** Champ « valeur mesurée » (rendu ici comme « Nouvel index »). */
  valeurField: ReactNode
}

/**
 * Panneau « changement de compteur » (manuel) : révélé sous la ligne d'une
 * opération de type compteur. Recueille l'index de dépose de l'ancien compteur et
 * l'index de pose du neuf, pour que la consommation reste juste malgré le
 * remplacement. Composant CONTRÔLÉ : l'état est porté par le parent.
 *
 * stopPropagation : un double-clic / appui long DANS le panneau (labels, fond) ne
 * doit PAS déclencher la bascule de statut de la carte (qui effacerait la saisie
 * de remplacement en cours).
 */
export function ChangementCompteurPanel({
  value,
  onChange,
  unite,
  previousValue,
  conso,
  valeurField,
}: ChangementCompteurPanelProps) {
  return (
    <div
      className="bg-muted/40 flex flex-col gap-2 rounded-md border border-dashed p-2 select-none"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Intro = le POURQUOI, en une phrase. Puis un formulaire vertical : à
          gauche le libellé + une explication simple, à droite la saisie (w-32,
          bords droits alignés, lignes espacées régulièrement). */}
      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <Replace className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Le compteur a été changé pendant la période ? Recopiez les chiffres
          ci-dessous : la consommation restera juste malgré le changement.
        </span>
      </p>
      {/* Relevé précédent (lecture seule) : base du calcul, lu automatiquement
          sur l'OT antérieur de la même gamme. Affiché pour que l'écart soit
          transparent ; « — » si l'app n'a trouvé aucun relevé antérieur. */}
      <div className="flex items-center gap-4">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm">Relevé précédent</span>
          <span className="text-muted-foreground text-xs">
            Le dernier index relevé avant le changement (OT précédent). Base du
            calcul de l'écart.
          </span>
        </span>
        <span className="w-32 pr-2 text-right text-sm font-medium tabular-nums">
          {previousValue != null
            ? `${previousValue.toLocaleString('fr-FR')}${unite ? ` ${unite}` : ''}`
            : '—'}
        </span>
      </div>
      <label className="flex items-center gap-4">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm">Ancien compteur à la dépose</span>
          <span className="text-muted-foreground text-xs">
            Le dernier chiffre affiché par l'ancien compteur, juste avant de le
            retirer.
          </span>
        </span>
        <ChampNombreUnite
          ariaLabel="Ancien compteur à la dépose"
          unite={unite}
          widthClassName="w-32"
          value={value.indexDepose}
          onValueChange={(v) => onChange({ ...value, indexDepose: v })}
        />
      </label>
      <label className="flex items-center gap-4">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm">Nouveau compteur à l'installation</span>
          <span className="text-muted-foreground text-xs">
            Le chiffre affiché par le compteur neuf au moment où on le pose
            (souvent 0).
          </span>
        </span>
        <ChampNombreUnite
          ariaLabel="Nouveau compteur à l'installation"
          unite={unite}
          widthClassName="w-32"
          value={value.indexPose}
          onValueChange={(v) => onChange({ ...value, indexPose: v })}
        />
      </label>
      <label className="flex items-center gap-4">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm">Nouvel index</span>
          <span className="text-muted-foreground text-xs">
            Le relevé d'aujourd'hui, lu sur le nouveau compteur.
          </span>
        </span>
        {valeurField}
      </label>
      {conso != null && (
        // Écart = consommation calculée (consciente du remplacement), séparée des
        // saisies par un filet ; même colonne (w-32) et même unité que ci-dessus.
        <div className="flex items-center gap-4 border-t pt-2">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm">Écart</span>
            <span className="text-muted-foreground text-xs">
              La consommation de la période, calculée pour vous malgré le
              changement de compteur.
            </span>
          </span>
          <span className="w-32 pr-2 text-right text-sm font-medium tabular-nums">
            {conso > 0 ? '+' : ''}
            {conso.toLocaleString('fr-FR')}
            {unite ? ` ${unite}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
