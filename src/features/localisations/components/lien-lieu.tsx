import { Link } from '@tanstack/react-router'
import { lienLocalisations } from '../lien-lieu'
import { useLienLieu } from '../use-lien-lieu'

/**
 * Lieu CLIQUABLE : son chemin court (« Bât. A / RDC / Hall »), qui ouvre la
 * fiche du lieu dans l'arbre des localisations
 * (`/localisations/<bâtiment>/<niveau>/<lieu>`). Brique partagée par les
 * fiches qui citent un lieu (DI, travaux, événement, équipement).
 *
 * Repli TEXTE (`texte`, ou « — ») tant que l'adresse n'est pas calculée, et
 * quand le lieu n'est pas visible : supprimé, ou hors des sites de la personne
 * (la RLS le masque — résultat vide, pas erreur).
 */
export function LienLieu({
  localId,
  texte,
}: {
  /** Lieu à ouvrir ; `null` → repli texte direct. */
  localId: string | null
  /** Texte de repli (nom figé du lieu, connu de l'appelant). */
  texte?: string | null
}) {
  const { segs, lieu } = useLienLieu(localId)
  if (!segs || !lieu) return <>{texte ?? '—'}</>
  return (
    <Link
      {...lienLocalisations(segs)}
      className="text-primary underline-offset-4 hover:underline"
    >
      {lieu.chemin_court ?? lieu.nom}
    </Link>
  )
}
