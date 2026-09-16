// =============================================================================
// Cible locale des sondes — adresses et clés, lues à l'exécution
// =============================================================================
// AUCUNE clé n'est écrite ici. Le dépôt est public : même les clés de
// démonstration de Supabase (celles que `supabase start` sert à l'identique sur
// toutes les installations du monde, et qui ne valent rien hors de 127.0.0.1)
// déclencheraient les scanners de secrets et donneraient à lire un JWT
// `service_role` en clair. La doctrine du projet est sans ambiguïté là-dessus.
//
// Les valeurs viennent donc de `supabase status`, c'est-à-dire de la pile qui
// tourne vraiment sur cette machine — ce qui a l'avantage de rendre les sondes
// justes même si les ports ont été décalés.
// =============================================================================
import { execFileSync } from 'node:child_process'

/**
 * Interroge la pile Supabase locale. `dossier` est le projet local monté pour
 * les tests (celui qui porte le `config.toml` aux ports décalés) — voir le
 * README de ce dossier.
 */
function statutLocal(dossier) {
  const brut = execFileSync(
    // Windows ne résout pas `npx` sans extension hors shell.
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--yes', 'supabase', 'status', '-o', 'json'],
    {
      cwd: dossier,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // Node refuse de lancer un `.cmd` hors shell depuis la 18.20 (EINVAL).
      shell: process.platform === 'win32',
    },
  )
  return JSON.parse(brut)
}

const DOSSIER = process.env.MARTIN_LOCAL_DIR ?? process.cwd()

let statut
try {
  statut = statutLocal(DOSSIER)
} catch (e) {
  console.error(
    [
      "La pile Supabase locale n'a pas répondu.",
      '',
      'Ces sondes écrivent, créent des comptes et tentent des élévations de',
      'privilèges : elles ne tournent QUE contre une base locale jetable.',
      '',
      `Dossier interrogé : ${DOSSIER}`,
      'Monter la cible : voir le README de ce dossier, puis',
      '  MARTIN_LOCAL_DIR=<dossier du projet local> node <sonde>.mjs',
      '',
      `Détail : ${e.message.slice(0, 200)}`,
    ].join('\n'),
  )
  process.exit(1)
}

/** Adresse de l'API locale (Kong). */
export const API = statut.API_URL
/** Adresse des Edge Functions locales. */
export const FN = `${statut.API_URL}/functions/v1`

/**
 * Clé PUBLIQUE. C'est avec elle que l'attaquant joue : toute sonde de lecture ou
 * d'écriture passe par là, jamais par `SERVICE`, sinon la RLS serait contournée
 * et chaque test passerait faussement.
 */
export const ANON = statut.ANON_KEY

/**
 * Clé de service. Elle ne sert QU'À DEUX CHOSES : préparer le terrain (créer les
 * comptes de test, semer les données) et établir la vérité terrain après coup.
 * Jamais à jouer l'attaquant.
 */
export const SERVICE = statut.SERVICE_ROLE_KEY

/** Garde-fou : on refuse de démarrer si la cible n'est pas locale. */
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API)) {
  console.error(
    `Cible refusée : ${API} n'est pas une adresse locale. Ces sondes écrivent ; ` +
      'elles ne tournent que contre une base locale jetable.',
  )
  process.exit(1)
}
