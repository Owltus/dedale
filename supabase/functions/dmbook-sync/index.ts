// Edge Function `dmbook-sync` — passages de la synchro Dmbook ⇄ Dédale (plan sync-dmbook).
//
// Appelée par la tâche planifiée (étape 7), jamais par l'application : l'appel
// doit porter l'en-tête `x-dmbook-cle` égal au secret `dmbook_cle_tache` du coffre (165),
// et `site_id` : un appel = un site (la tâche planifiée appelle chaque site connecté).
//
// Modes disponibles aujourd'hui :
//   { mode: 'photo', de, a }  LECTURE SEULE : pages `de` à `a` de la liste Dmbook
//                      (30 pages au plus par appel : limite de calcul d'une fonction),
//                      pour rattacher l'historique (étape 4). Rien n'est écrit, ni
//                      dans Dmbook, ni dans les DI.
//   { mode: 'passage', complet?, reel? }  d'abord la file Dédale → Dmbook (envoyer.ts,
//                      secret DMBOOK_ECRITURE = aucune | test | toutes, « aucune » par défaut),
//                      puis un passage Dmbook → Dédale (passage.ts).
//   { mode: 'envoi', reel }  la file Dédale → Dmbook seule : réveil immédiat par la base
//                      quand une demande change (166).
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

import {
  clientServeur,
  garderSession,
  lireCleTache,
  lireConnexion,
  majConnexion,
  ouvrir,
  prendreVerrou,
  raison,
  rendreVerrou,
} from '../_shared/dmbook/serveur.ts'
import { SessionExpiree } from '../_shared/dmbook/client.ts'
import { chargerLocaux, passage } from './passage.ts'
import { envoyer, lireNiveau } from './envoyer.ts'

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

  const cle = await lireCleTache(sb)
  const recue = req.headers.get('x-dmbook-cle') ?? ''
  if (!cle || !recue || !egal(recue, cle)) return json({ error: 'Refusé.' }, 401)

  let corps: { mode?: unknown; site_id?: unknown; de?: unknown; a?: unknown; complet?: unknown; reel?: unknown }
  try {
    corps = await req.json()
  } catch {
    return json({ error: 'Corps de requête JSON attendu.' }, 400)
  }
  if (corps.mode !== 'photo' && corps.mode !== 'passage' && corps.mode !== 'envoi') {
    return json({ error: 'Mode inconnu.' }, 400)
  }
  const de = Number(corps.de ?? 1)
  const a = Number(corps.a ?? de + 29)
  if (!Number.isInteger(de) || !Number.isInteger(a) || de < 1 || a < de || a - de > 29) {
    return json({ error: 'Pages : de ≥ 1, a ≥ de, 30 pages au plus.' }, 400)
  }

  const site = typeof corps.site_id === 'string' ? corps.site_id : ''
  const c = /^[0-9a-f-]{36}$/i.test(site) ? await lireConnexion(sb, site) : null
  if (!c) return json({ error: 'Site sans connexion Dmbook.' }, 400)

  if (!(await prendreVerrou(sb, site, 300))) return json({ sortie: 'deja_en_cours' })
  try {
    if (c.etat !== 'ok') return json({ sortie: 'non_connecte', etat: c.etat })

    const o = await ouvrir(sb, c, 150)
    if ('issue' in o) return json({ sortie: 'connexion', ...o.issue })
    const dm = o.dm
    if (corps.mode === 'envoi') {
      // Réveil immédiat après une action Dédale (166) : la file seule, sans relire Dmbook.
      const reel = corps.reel === true && Deno.env.get('DMBOOK_SYNC_REEL') === 'oui'
      const niveau = reel ? lireNiveau(Deno.env.get('DMBOOK_ECRITURE')) : 'aucune'
      dm.ecritureAutorisee = niveau !== 'aucune'
      try {
        const locaux = await chargerLocaux(sb, site)
        const tours = []
        // Ce qui est arrivé pendant l'envoi repart tout de suite (3 tours au plus).
        for (let i = 0; i < 3; i++) {
          const r = await envoyer(sb, dm, site, locaux, niveau)
          tours.push(r)
          if (r.envoyes === 0) break
        }
        await garderSession(sb, site, dm)
        return json({ sortie: 'envoi', requetes: dm.requetes, tours })
      } catch (e) {
        if (e instanceof SessionExpiree) return json({ sortie: 'session_expiree' })
        return json({ sortie: 'erreur', message: raison(e), requetes: dm.requetes })
      } finally {
        dm.ecritureAutorisee = false
      }
    }
    if (corps.mode === 'passage') {
      try {
        const { data: dates } = await sb.from('dmbook_connexions').select('dernier_passage_complet').eq('site_id', site)
          .single()
        const dernier = dates?.dernier_passage_complet ? Date.parse(dates.dernier_passage_complet) : 0
        const complet = typeof corps.complet === 'boolean' ? corps.complet : Date.now() - dernier > 55 * 60_000
        const reel = corps.reel === true && Deno.env.get('DMBOOK_SYNC_REEL') === 'oui'
        // 1. Dédale → Dmbook d'abord (étape 6) : ce qui part pose son anti-écho avant la lecture.
        const niveau = reel ? lireNiveau(Deno.env.get('DMBOOK_ECRITURE')) : 'aucune'
        dm.ecritureAutorisee = niveau !== 'aucune'
        let envoi
        try {
          envoi = await envoyer(sb, dm, site, await chargerLocaux(sb, site), niveau)
        } finally {
          dm.ecritureAutorisee = false
        }
        // 2. Dmbook → Dédale (étape 5).
        const rapport = await passage(sb, dm, site, { reel, complet })
        // 3. Ce qui a été fait dans Dédale pendant la lecture (son réveil a trouvé le verrou pris).
        if (niveau !== 'aucune') {
          dm.ecritureAutorisee = true
          try {
            const suite = await envoyer(sb, dm, site, await chargerLocaux(sb, site), niveau)
            if (suite.envoyes) {
              envoi = {
                ...envoi,
                envoyes: envoi.envoyes + suite.envoyes,
                details: [...envoi.details, ...suite.details],
              }
            }
          } finally {
            dm.ecritureAutorisee = false
          }
        }
        await garderSession(sb, site, dm)
        if (reel) {
          const maintenant = new Date().toISOString()
          if (rapport.pause) {
            await majConnexion(sb, site, { etat: 'pause', message: rapport.pause, dernier_passage: maintenant })
          } else {await majConnexion(sb, site, {
              dernier_passage: maintenant,
              ...(complet && !rapport.details.some((d) => d.includes('incomplet'))
                ? { dernier_passage_complet: maintenant }
                : {}),
            })}
        }
        return json({ sortie: 'passage', ...rapport, requetes: dm.requetes, envoi })
      } catch (e) {
        if (e instanceof SessionExpiree) return json({ sortie: 'session_expiree' })
        return json({ sortie: 'erreur', message: raison(e), requetes: dm.requetes })
      }
    }
    try {
      const r = await dm.listerTout(200, de, a)
      await garderSession(sb, site, dm)
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
        await majConnexion(sb, site, { message: 'Session Dmbook expirée pendant la lecture.' })
        return json({ sortie: 'session_expiree' })
      }
      return json({ sortie: 'erreur', message: raison(e), requetes: dm.requetes })
    }
  } catch (e) {
    console.error('[dmbook-sync]', raison(e))
    return json({ error: 'Erreur du serveur.' }, 500)
  } finally {
    await rendreVerrou(sb, site)
  }
})
