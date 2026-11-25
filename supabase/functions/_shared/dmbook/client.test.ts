/**
 * Tests du client Dmbook sur des pages FABRIQUÉES (aucune vraie page : dépôt public).
 * Leur structure reproduit celle relevée le 20/11/2026 (plan sync-dmbook, étape 1).
 */
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { Dmbook, lireEdition, lireFiche, lireListeLegere, SessionExpiree } from './client.ts'

const BASE = 'https://exemple.dmbook.test'
const ligne = (id: string, ts: number, n: number, statut: string, texte: string) => `
<tr class="entry ticket" id="entry_${id}" data-id="${id}" data-ts="${ts}"><td>
  <span class="content">${texte} — Auteur Test #${n} - ${statut} - Aujourd'hui</span>
  <span class="meta">#${n} - ${statut} - Aujourd'hui</span>
  <li class="dropdown-header">Créé le 19/11/2026 15:23</li>
</td></tr>`
const LISTE = `<html><body><p>Total : <strong>2</strong></p><table>
${ligne('11', 1795098235, 7031, 'Ouvert', '#305 Rideau penderie décroché')}
${ligne('10', 1644232595, 2616, 'Fermé', '#513 Lessivage mur')}
</table></body></html>`
const fiche = (id: string, h2: string, corps: string, classe = 'ticket-status-bg-close') => `<html><body>
<h2><div class="pull-right"><a href="/ticket/${id}/update?return_to=show" class="btn update-entry">Éditer</a></div>
${h2} &nbsp;<small class="ticket-number">technique#2616</small></h2>
<div class="ticket-meta"><span class="label label-default ${classe}">Fermé</span></div>
<li class="entry entry-ticket" data-id="${id}"><blockquote><span class="content">${corps}</span></blockquote>
<form action="/entries/delete?id=${id}" method="post"><input type="hidden" name="csrf_token" value="jeton"></form></li>
<div class="sidebar-block ticket-deadline"><h3>Date de création</h3><p>30 nov. 2021 à 17:17</p></div>
</body></html>`
const RENVOI = `<html><script>window.location = "https://app.dmbook.pro/signin?x=1"</script></html>`
const EDITION = `<form action="/ticket/10/update" method="post">
<input type="hidden" name="csrf_token" value="jeton"><input type="hidden" name="book_id" value="2624">
<textarea name="content">#513 Lessivage mur
côté TV &amp; plinthe</textarea>
<select name="priority"><option value="10">Bas</option><option value="20" selected>Normal</option></select>
<input type="date" name="date" value="2021-11-30"><input type="file" name="file"></form>`

Deno.test('liste légère (sans DOM) : identifiants, activité, numéros, statuts et total', () => {
  const legere = lireListeLegere(LISTE)
  assertEquals(legere.total, 2)
  assertEquals(legere.tickets.map(({ auteur: _a, ...t }) => t), [
    { id: '11', modifieLe: 1795098235, numero: 7031, statut: 'ouvert' },
    { id: '10', modifieLe: 1644232595, numero: 2616, statut: 'ferme' },
  ])
})

Deno.test('auteur Dmbook (D21) : nom tel qu’écrit, sans l’identifiant de connexion', () => {
  const ligneAuteur = `<tr class="entry ticket" data-id="12" data-ts="5"><td><span class="content">x <span class="author" title="Jean D&#039;Arc"> —&nbsp;jdarc</span></span><span class="meta">#7 - Ouvert - Hier</span></td></tr>`
  assertEquals(lireListeLegere(`Total : <strong>1</strong>${ligneAuteur}`).tickets[0].auteur, "Jean D'Arc")
  const f = lireFiche('10', fiche('10', 'x', 'y').replace('</body>', '<li class="ticket-author"><i></i> Marc TESTEUR (MarcT) </li></body>'))
  assertEquals(f.auteur, 'Marc TESTEUR')
})

Deno.test('fiche d\'une ligne : le titre (copie retouchée) est ignoré, bouton Éditer exclu', () => {
  const f = lireFiche('10', fiche('10', 'Lessivage mur côté TV', '<a href="/search?q=%23513">#513</a> Lessivage mur côté TV'))
  assertEquals(f.texte, '#513 Lessivage mur côté TV')
  assertEquals(f.statut, 'ferme')
  assertEquals(f.numero, 2616)
})

Deno.test('fiche sur plusieurs lignes : la 1re ligne vit dans le titre (h2) et doit être gardée', () => {
  const f = lireFiche('10', fiche('10', 'Liste des clefs <a href="/search?q=%23631">#631</a>', '204 201 305'))
  assertEquals(f.texte, 'Liste des clefs #631\n204 201 305')
})

Deno.test('édition : texte brut exact (retours à la ligne, entités) + champs renvoyés tels quels', () => {
  const e = lireEdition('10', EDITION, BASE)
  assertEquals(e.texte, '#513 Lessivage mur\ncôté TV & plinthe')
  assertEquals(e.champs.get('priority'), '20')
  assertEquals(e.champs.get('date'), '2021-11-30')
  assertEquals(e.champs.has('file'), false)
  assertEquals(e.action, `${BASE}/ticket/10/update`)
})

/** Faux serveur : chemin → [statut HTTP, page]. */
const faux = (routes: Record<string, [number, string]>) => {
  const vus: string[] = []
  const f = ((url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url))
    vus.push(`${init?.method ?? 'GET'} ${u.pathname}`)
    const [statut, html] = routes[u.pathname] ?? [500, 'panne']
    return Promise.resolve(new Response(html, { status: statut }))
  }) as typeof fetch
  return { f, vus }
}

Deno.test('existe : « supprimé » seulement sur une vraie 404 « Page introuvable »', async () => {
  const { f } = faux({
    '/ticket/1': [404, '<title>Page introuvable (erreur 404)</title>'],
    '/ticket/2': [200, fiche('2', 'x', 'y')],
    '/ticket/3': [200, RENVOI],
    '/ticket/4': [404, 'Not Found'],
  })
  const dm = new Dmbook({ base: BASE, carnet: '1', fetch: f })
  assertEquals(await dm.existe('1'), 'supprime')
  assertEquals(await dm.existe('2'), 'present')
  assertEquals(await dm.existe('3'), 'inconnu') // session expirée : jamais une suppression
  assertEquals(await dm.existe('4'), 'inconnu') // 404 sans la page Dmbook : prudence
  assertEquals(await dm.existe('5'), 'inconnu') // panne
})

Deno.test('session expirée : erreur dédiée, pas de lecture silencieuse', async () => {
  const { f } = faux({ '/tickets/1': [200, RENVOI] })
  const dm = new Dmbook({ base: BASE, carnet: '1', fetch: f })
  await assertRejects(() => dm.listerLeger(1), SessionExpiree)
})

Deno.test('liste complète : « complet » seulement si le nombre lu égale le total affiché', async () => {
  const { f } = faux({ '/tickets/1': [200, LISTE.replace('Total : <strong>2</strong>', 'Total : <strong>3</strong>')] })
  const dm = new Dmbook({ base: BASE, carnet: '1', fetch: f })
  const r = await dm.listerTout(0)
  assertEquals(r.tickets.length, 2)
  assertEquals(r.complet, false)
})

Deno.test('écritures verrouillées par défaut : aucune requête POST envoyée', async () => {
  const { f, vus } = faux({ '/ticket/10': [200, fiche('10', 'x', 'y')] })
  const dm = new Dmbook({ base: BASE, carnet: '1', fetch: f })
  await assertRejects(() => dm.supprimer('10'), Error, 'verrouillée')
  await assertRejects(() => dm.modifierTexte('10', 'x'), Error, 'verrouillée')
  await assertRejects(() => dm.creer('x'), Error, 'verrouillée')
  await assertRejects(() => dm.changerStatut('10', 'ferme'), Error, 'verrouillée')
  assertEquals(vus, [])
})

Deno.test('suppression déverrouillée : POST sur le formulaire de la fiche avec son jeton', async () => {
  const { f, vus } = faux({ '/ticket/10': [200, fiche('10', 'x', 'y')], '/entries/delete': [200, 'ok'] })
  const dm = new Dmbook({ base: BASE, carnet: '1', fetch: f })
  dm.ecritureAutorisee = true
  await dm.supprimer('10')
  assertEquals(vus, ['GET /ticket/10', 'POST /entries/delete'])
})

Deno.test('plafond de requêtes : arrêt net (anti-boucle)', async () => {
  const { f } = faux({ '/ticket/2': [200, fiche('2', 'x', 'y')] })
  const dm = new Dmbook({ base: BASE, carnet: '1', fetch: f, plafond: 2 })
  await dm.detail('2')
  await dm.detail('2')
  await assertRejects(() => dm.detail('2'), Error, 'Plafond')
})
