// Refus des jetons du connecteur Claude (audit du 17/11/2026, migration 162).
//
// Un jeton émis à une application OAuth (claim `client_id`, ex. Claude) est un
// jeton Supabase valable. Les fonctions de gestion des comptes agissent avec la
// clé de service, hors RLS et hors garde d'entrée (157) : elles doivent donc
// refuser elles-mêmes tout jeton de connecteur. Via Claude, seules la lecture
// et les gestes claude_* sont permis.
//
// La charge utile est lue sans vérifier la signature : on ne s'en sert que
// pour REFUSER. Un jeton sans `client_id` reste vérifié ensuite par
// auth.getUser(), comme avant.

export function jetonDeConnecteur(jeton: string): boolean {
  try {
    const b64 = jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const charge = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')))
    return charge !== null && typeof charge === 'object' && 'client_id' in charge
  } catch {
    // Jeton illisible : auth.getUser() le refusera.
    return false
  }
}

export const REFUS_CONNECTEUR = 'Action impossible depuis un connecteur (Claude) : passe par l’application Dédale.'
