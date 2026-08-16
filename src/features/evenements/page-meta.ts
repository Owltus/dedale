import { CalendarClock } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

export const PAGE_META: PageMeta = {
  titre: 'Événements',
  description:
    'Journal de ce qui survient dans l’établissement : constat, suivi, clôture.',
  // « voir » et non « gérer » : l'écran est consultable par un lecteur.
  hint: 'Choisis un site pour voir ses événements.',
  icone: CalendarClock,
}
