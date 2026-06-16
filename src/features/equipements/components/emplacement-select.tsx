import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { equipementsQueries } from '../queries'
import { SelectField } from '@/components/common/select-field'

interface EmplacementSelectProps {
  siteId: string
  /** Local sélectionné (`local_id`) ou '' si aucun. */
  value: string
  onChange: (localId: string) => void
  error?: string
}

/**
 * Sélecteur d'emplacement EN CASCADE, dérivé de `v_locaux_chemin` :
 * - un seul bâtiment sur le site → deux listes (Niveau → Local) ;
 * - plusieurs bâtiments → trois listes (Bâtiment → Niveau → Local).
 * Le choix amont réinitialise l'aval. La valeur remontée est le `local_id`.
 */
export function EmplacementSelect({
  siteId,
  value,
  onChange,
  error,
}: EmplacementSelectProps) {
  const { data: locaux = [] } = useQuery(equipementsQueries.locaux(siteId))

  // Bâtiments distincts du site.
  const batiments = useMemo(() => {
    const map = new Map<string, string>()
    for (const l of locaux) {
      if (l.batiment_id) map.set(l.batiment_id, l.batiment_nom ?? '')
    }
    return [...map].map(([id, nom]) => ({ id, nom }))
  }, [locaux])
  const batimentUnique = batiments.length <= 1

  const [batimentId, setBatimentId] = useState('')
  const [niveauId, setNiveauId] = useState('')

  // Bâtiment effectif : l'unique s'il n'y en a qu'un, sinon celui choisi.
  const effBatiment = batimentUnique ? (batiments[0]?.id ?? '') : batimentId

  // Niveaux distincts du bâtiment effectif.
  const niveaux = useMemo(() => {
    const map = new Map<string, string>()
    for (const l of locaux) {
      if (l.batiment_id === effBatiment && l.niveau_id) {
        map.set(l.niveau_id, l.niveau_nom ?? '')
      }
    }
    return [...map].map(([id, nom]) => ({ id, nom }))
  }, [locaux, effBatiment])

  // Locaux du niveau choisi.
  const locauxNiveau = useMemo(
    () =>
      locaux.filter(
        (l) => l.batiment_id === effBatiment && l.niveau_id === niveauId,
      ),
    [locaux, effBatiment, niveauId],
  )

  function choisirBatiment(id: string) {
    setBatimentId(id)
    setNiveauId('')
    onChange('') // réinitialise niveau + local en aval
  }
  function choisirNiveau(id: string) {
    setNiveauId(id)
    onChange('') // réinitialise le local
  }

  return (
    <div className="grid gap-4">
      {!batimentUnique && (
        <SelectField
          label="Bâtiment"
          required
          id="emplacement_batiment"
          value={batimentId}
          onChange={choisirBatiment}
        >
          <option value="">— Choisir un bâtiment —</option>
          {batiments.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nom}
            </option>
          ))}
        </SelectField>
      )}

      <SelectField
        label="Niveau"
        required
        id="emplacement_niveau"
        value={niveauId}
        onChange={choisirNiveau}
      >
        <option value="">— Choisir un niveau —</option>
        {niveaux.map((n) => (
          <option key={n.id} value={n.id}>
            {n.nom}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Local"
        required
        id="emplacement_local"
        value={value}
        onChange={onChange}
        error={error}
      >
        <option value="">— Choisir un local —</option>
        {locauxNiveau.map((l) => (
          <option key={l.local_id ?? ''} value={l.local_id ?? ''}>
            {l.local_nom ?? ''}
          </option>
        ))}
      </SelectField>
    </div>
  )
}
