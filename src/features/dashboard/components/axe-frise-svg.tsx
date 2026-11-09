import type { AxeFrise } from '../frise-axe'

/** Hauteur réservée en haut de la frise : mois puis numéros de semaine. */
export const AXE_FRISE_H = 30

/**
 * Fond COMMUN des frises du tableau de bord (contrats, obligations), à poser
 * en premier dans le `<svg>` :
 *   - la SEMAINE ISO EN COURS en bande (lundi → dimanche), comme la colonne de
 *     la semaine courante du planning — plus de trait « aujourd'hui » ;
 *   - les mois (trait + libellé, ligne du haut) ;
 *   - les numéros de semaine ISO 8601 (« S47 », lundi = 1er jour), centrés sur
 *     leur semaine ; celui de la semaine en cours en gras.
 */
export function AxeFriseSvg({
  axe,
  hauteur,
}: {
  axe: AxeFrise
  hauteur: number
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

      {axe.mois.map((m, i) => (
        <g key={`mois-${String(i)}`}>
          <line
            x1={m.x}
            y1={2}
            x2={m.x}
            y2={hauteur}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text
            x={m.x + 3}
            y={10}
            style={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
          >
            {m.label}
          </text>
        </g>
      ))}

      {axe.semaines.map((s) =>
        s.libelle || s.numero === courante?.numero ? (
          <text
            key={`sem-${String(s.x0)}`}
            x={(s.x0 + s.x1) / 2}
            y={AXE_FRISE_H - 6}
            textAnchor="middle"
            style={{
              fill:
                s.numero === courante?.numero
                  ? 'var(--foreground)'
                  : 'var(--muted-foreground)',
              fontSize: 9,
              fontWeight: s.numero === courante?.numero ? 700 : 400,
              opacity: s.numero === courante?.numero ? 1 : 0.8,
            }}
          >
            S{s.numero}
          </text>
        ) : null,
      )}
    </g>
  )
}
