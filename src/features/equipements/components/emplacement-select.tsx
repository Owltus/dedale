import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { equipementsQueries } from '../queries'
import { SelectField } from '@/components/common/select-field'

interface EmplacementSelectProps {
  siteId: string
  /** Local sélectionné (`local_id`) ou '' si aucun. */
  value: string
  onChange: (localId: string) => void
  error?: string
  /**
   * Contenu de la COLONNE DROITE (ex. dates), placé à côté de Niveau/Local pour
   * compacter. Fourni → mise en page 2 colonnes (Niveau+Local à gauche, `aside` à
   * droite) ; absent → Niveau/Local empilés pleine largeur.
   */
  aside?: ReactNode
  /**
   * Locaux à MASQUER de la liste « Local » (ex. ceux déjà sélectionnés dans un
   * sélecteur multiple). Optionnel.
   */
  excludeLocalIds?: string[]
  /**
   * Marque les champs comme requis (astérisque). Défaut `true` (formulaire d'une
   * unique entité). Mettre `false` en mode AJOUT à une sélection multiple, où le
   * choix n'est pas obligatoire en soi.
   */
  requiredEmplacement?: boolean
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
  aside,
  excludeLocalIds,
  requiredEmplacement = true,
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

  // Local correspondant à la valeur courante : sert à PRÉ-POSITIONNER la cascade
  // en édition (bâtiment/niveau déduits du local), SANS état ni effet — dès qu'un
  // choix amont est fait, c'est l'état interne qui prime.
  const localRow = useMemo(
    () => locaux.find((l) => l.local_id === value) ?? null,
    [locaux, value],
  )

  // Bâtiment / niveau EFFECTIFS : choix interne s'il existe, sinon déduit du local
  // courant (édition). Bâtiment unique → toujours l'unique.
  const effBatiment = batimentUnique
    ? (batiments[0]?.id ?? '')
    : batimentId !== ''
      ? batimentId
      : (localRow?.batiment_id ?? '')
  const effNiveau = niveauId !== '' ? niveauId : (localRow?.niveau_id ?? '')

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

  // Locaux du niveau choisi (hors locaux explicitement exclus).
  const locauxNiveau = useMemo(() => {
    const exclus = new Set(excludeLocalIds ?? [])
    return locaux.filter(
      (l) =>
        l.batiment_id === effBatiment &&
        l.niveau_id === effNiveau &&
        !exclus.has(l.local_id ?? ''),
    )
  }, [locaux, effBatiment, effNiveau, excludeLocalIds])

  function choisirBatiment(id: string) {
    setBatimentId(id)
    setNiveauId('')
    onChange('') // réinitialise niveau + local en aval
  }
  function choisirNiveau(id: string) {
    // Multi-bâtiments en ÉDITION : le bâtiment n'est encore que DÉRIVÉ du local
    // (batimentId === ''). Le figer en état AVANT de vider le local, sinon
    // `localRow` devient null → `effBatiment` retombe à '' → la cascade s'effondre.
    if (batimentId === '' && effBatiment) setBatimentId(effBatiment)
    setNiveauId(id)
    onChange('') // réinitialise le local
  }
  function choisirLocal(id: string) {
    // Idem : revenir à « — Choisir un local — » ne doit pas effondrer bâtiment et
    // niveau encore seulement dérivés du local courant → on les fige d'abord.
    if (batimentId === '' && effBatiment) setBatimentId(effBatiment)
    if (niveauId === '' && effNiveau) setNiveauId(effNiveau)
    onChange(id)
  }

  const niveauLocal = (
    <div className="grid gap-4">
      <SelectField
        label="Niveau"
        required={requiredEmplacement}
        id="emplacement_niveau"
        value={effNiveau}
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
        required={requiredEmplacement}
        id="emplacement_local"
        value={value}
        onChange={choisirLocal}
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

  return (
    <div className="grid gap-4">
      {/* Bâtiment sur TOUTE LA LIGNE (uniquement si plusieurs bâtiments). */}
      {!batimentUnique && (
        <SelectField
          label="Bâtiment"
          required={requiredEmplacement}
          id="emplacement_batiment"
          value={effBatiment}
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

      {/* Avec `aside` (ex. dates) : 2 colonnes — Niveau/Local à gauche, aside à
          droite (compact). Sinon Niveau/Local pleine largeur. */}
      {aside !== undefined ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {niveauLocal}
          <div className="grid content-start gap-4">{aside}</div>
        </div>
      ) : (
        niveauLocal
      )}
    </div>
  )
}
