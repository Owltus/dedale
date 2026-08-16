import { Package } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

/** Identité de la page Équipements — source unique. */
export const PAGE_META: PageMeta = {
  titre: 'Équipements',
  description: 'Parc matériel du site, rangé par catégorie.',
  // « voir » et non « gérer » : l'écran est consultable par un lecteur, qui n'y
  // gère rien. Même verbe sur les 11 `page-meta.ts` de l'application — vérifié,
  // et non supposé : deux d'entre eux disaient « consulter » et « afficher »
  // alors que ce commentaire affirmait déjà l'uniformité.
  hint: 'Choisis un site pour voir ses équipements.',
  icone: Package,
}
