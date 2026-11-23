import { supabase } from '@/lib/supabase'

/**
 * Synchronise les liaisons `gammes_equipements` d'UN côté du lien, partagé par
 * la fiche gamme (`pivot: 'gamme'`) et la fiche équipement
 * (`pivot: 'equipement'`). Diff current/selected → INSERT des ajouts, puis
 * DELETE des retraits. `id` est celui du pivot ; `current`/`selected` sont les
 * identifiants de l'autre côté.
 */
export async function syncGammesEquipements({
  pivot,
  id,
  current,
  selected,
}: {
  pivot: 'gamme' | 'equipement'
  id: string
  current: string[]
  selected: string[]
}) {
  const toAdd = selected.filter((x) => !current.includes(x))
  const toRemove = current.filter((x) => !selected.includes(x))

  if (toAdd.length > 0) {
    await supabase
      .from('gammes_equipements')
      .insert(
        toAdd.map((autre) =>
          pivot === 'gamme'
            ? { gamme_id: id, equipement_id: autre }
            : { gamme_id: autre, equipement_id: id },
        ),
      )
      .throwOnError()
  }
  if (toRemove.length > 0) {
    await supabase
      .from('gammes_equipements')
      .delete()
      .eq(pivot === 'gamme' ? 'gamme_id' : 'equipement_id', id)
      .in(pivot === 'gamme' ? 'equipement_id' : 'gamme_id', toRemove)
      .throwOnError()
  }
}
