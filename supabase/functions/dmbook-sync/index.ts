// Edge Function `dmbook-sync` — passages de la synchro Dmbook ⇄ Dédale (plan sync-dmbook).
//
// Appelée par la tâche planifiée (étape 7), jamais par l'application : l'appel
// doit porter l'en-tête `x-dmbook-cle` égal à `dmbook_etat.cle_tache` (164).
//
// Modes disponibles aujourd'hui :
//   { mode: 'photo', de, a }  LECTURE SEULE : pages `de` à `a` de la liste Dmbook
//                      (30 pages au plus par appel : limite de calcul d'une fonction),
//                      pour rattacher l'historique (étape 4). Rien n'est écrit, ni
//                      dans Dmbook, ni dans les DI.
//   { mode: 'passage', complet?, reel? }  un passage Dmbook → Dédale (passage.ts).
//                      À BLANC par défaut : rien n'est écrit, le rapport dit ce qui
//                      serait fait. L'écriture réelle exige reel: true ET le secret
//                      serveur DMBOOK_SYNC_REEL = « oui » (posé seulement après accord PO).
//                      `complet` : tour complet de la liste (sinon décidé seul : une fois par heure).
//
// Garde-fous : un verrou (un seul passage à la fois) ; on ne contacte pas
// Dmbook si l'état n'est pas « ok » (code attendu, pause, erreur) ; session
// expirée → UNE connexion, code demandé → arrêt et fenêtre dans Dédale ;
// plafond de requêtes ; écritures Dmbook verrouillées dans le client.
//
// Déploiement : `npx supabase functions deploy dmbook-sync --no-verify-jwt --project-ref ybxuojtyevldrbieaykh`
// (`--no-verify-jwt` : l'appel vient de la base, avec la clé de la tâche, pas d'un jeton de personne).

import { clientServeur, garderSession, lireEtat, majEtat, ouvrir, raison, rendreVerrou, prendreVerrou } from '../_shared/dmbook/serveur.ts'
import { SessionExpiree } from '../_shared/dmbook/client.ts'
import { passage } from './passage.ts'

const json = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })

/** Comparaison à durée constante (la clé ne se devine pas caractère par caractère). */
function egal(a: string, b: string) {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let d = 0
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]
  return d === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)
  const sb = clientServeur()

  const { data: cle } = await sb.from('dmbook_etat').select('cle_tache').eq('id', true).single()
  const recue = req.headers.get('x-dmbook-cle') ?? ''
  if (!cle?.cle_tache || !recue || !egal(recue, cle.cle_tache)) return json({ error: 'Refusé.' }, 401)

  let corps: { mode?: unknown; de?: unknown; a?: unknown; complet?: unknown; reel?: unknown }
  try {
    corps = await req.json()
  } catch {
    return json({ error: 'Corps de requête JSON attendu.' }, 400)
  }
  if (corps.mode !== 'photo' && corps.mode !== 'passage') return json({ error: 'Mode inconnu.' }, 400)
  const de = Number(corps.de ?? 1)
  const a = Number(corps.a ?? de + 29)
  if (!Number.isInteger(de) || !Number.isInteger(a) || de < 1 || a < de || a - de > 29)
    return json({ error: 'Pages : de ≥ 1, a ≥ de, 30 pages au plus.' }, 400)

  if (!(await prendreVerrou(sb, 300))) return json({ sortie: 'deja_en_cours' })
  try {
    const etat = await lireEtat(sb)
    if (etat.etat !== 'ok') return json({ sortie: 'non_connecte', etat: etat.etat })

    const o = await ouvrir(sb, etat, 150)
    if ('issue' in o) return json({ sortie: 'connexion', ...o.issue })
    const dm = o.dm
    if (corps.mode === 'passage') {
      try {
        const { data: dates } = await sb.from('dmbook_etat').select('dernier_passage_complet').eq('id', true).single()
        const dernier = dates?.dernier_passage_complet ? Date.parse(dates.dernier_passage_complet) : 0
        const complet = typeof corps.complet === 'boolean' ? corps.complet : Date.now() - dernier > 55 * 60_000
        const reel = corps.reel === true && Deno.env.get('DMBOOK_SYNC_REEL') === 'oui'
        const rapport = await passage(sb, dm, etat.site_id, { reel, complet })
        await garderSession(sb, dm)
        if (reel) {
          const maintenant = new Date().toISOString()
          if (rapport.pause) await majEtat(sb, { etat: 'pause', message: rapport.pause, dernier_passage: maintenant })
          else await majEtat(sb, { dernier_passage: maintenant, ...(complet && !rapport.details.some((d) => d.includes('incomplet')) ? { dernier_passage_complet: maintenant } : {}) })
        }
        return json({ sortie: 'passage', ...rapport })
      } catch (e) {
        if (e instanceof SessionExpiree) return json({ sortie: 'session_expiree' })
        return json({ sortie: 'erreur', message: raison(e), requetes: dm.requetes })
      }
    }
    try {
      const r = await dm.listerTout(200, de, a)
      await garderSession(sb, dm)
      return json({
        sortie: 'photo',
        requetes: dm.requetes,
        total: r.total,
        derniere: r.derniere,
        fini: r.fini,
        tickets: r.tickets.map((t) => ({ id: t.id, numero: t.numero, ts: t.modifieLe, statut: t.statut })),
      })
    } catch (e) {
      if (e instanceof SessionExpiree) {
        // La session est tombée en pleine lecture : au prochain appel, UNE reconnexion.
        await majEtat(sb, { message: 'Session Dmbook expirée pendant la lecture.' })
        return json({ sortie: 'session_expiree' })
      }
      return json({ sortie: 'erreur', message: raison(e), requetes: dm.requetes })
    }
  } catch (e) {
    console.error('[dmbook-sync]', raison(e))
    return json({ error: 'Erreur du serveur.' }, 500)
  } finally {
    await rendreVerrou(sb)
  }
})
