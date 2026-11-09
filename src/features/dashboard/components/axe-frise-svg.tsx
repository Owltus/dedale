import type { AxeFrise } from '../frise-axe'

/** Hauteur réservée en haut de la frise pour les libellés de mois. */
export const AXE_FRISE_H = 18

/**
 * Fond COMMUN des frises du tableau de bord (contrats, obligations), à poser
 * en premier dans le `<svg>` :
 *   - la SEMAINE ISO EN COURS en bande (lundi → dimanche), comme la colonne de
 *     la semaine courante du planning — plus de trait « aujourd'hui » ;
 *   - l'année en filigrane ;
 *   - les mois (trait + libellé en haut). Pas de numéros de semaine (PO).
 */
export function AxeFriseSvg({
  axe,
  hauteur,
  largeur,
}: {
  axe: AxeFrise
  hauteur: number
  largeur: number
}) {
  const courante = axe.semaineCourante
  return (
    <g aria-hidden="true">
      {courante && (
        <rect
          x={courante.x0}
          y={0}
          width={courante.x1 - courante.x0}
          height={hauteur}
          rx={3}
          fill="var(--accent)"
        />
      )}

      <text
        x={largeur / 2}
        y={hauteur * 0.66}
        textAnchor="middle"
        style={{
          fill: 'var(--muted-foreground)',
          opacity: 0.07,
          fontSize: hauteur * 0.55,
          fontWeight: 700,
        }}
      >
        {axe.filigrane}
      </text>

      {axe.mois.map((m, i) => (
        <g key={`mois-${String(i)}`}>
          <line
            x1={m.x}
            y1={AXE_FRISE_H}
            x2={m.x}
            y2={hauteur}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text
            x={m.x}
            y={AXE_FRISE_H - 7}
            textAnchor="middle"
            style={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
          >
            {m.label}
          </text>
        </g>
      ))}
    </g>
  )
}
