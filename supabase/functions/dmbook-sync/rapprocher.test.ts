import { assertEquals } from 'jsr:@std/assert@1'
import { Locaux } from '../_shared/dmbook/lieux.ts'
import { empreinteDmbook } from '../_shared/dmbook/texte.ts'
import type { TicketDetail } from '../_shared/dmbook/client.ts'
import { dateDmbook, decider, type DiActuelle, type Lien } from './rapprocher.ts'

const locaux = new Locaux([
  { id: 'c112', nom: 'Chambre 112', niveau: 'R+1' },
  { id: 'c114', nom: 'Chambre 114', niveau: 'R+1' },
  { id: 'sauna', nom: 'Vestiaire - Sauna', niveau: 'R-1' },
  { id: 'club', nom: 'Club', niveau: 'RDC' },
])
const fiche = (texte: string, statut: TicketDetail['statut'] = 'ouvert'): TicketDetail =>
  ({ id: '10', numero: 7040, texte, statut, creeLe: '21 nov. 2026 à 09:05' })
const lien = async (texte: string, statut = 'ouvert', autre: Partial<Lien> = {}): Promise<Lien> =>
  ({ dmbook_id: '10', numero: 7040, di_id: 'd1', dmbook_ts: 100, dmbook_empreinte: await empreinteDmbook(texte, statut), lieu_manuel: false, ...autre })
const di = (autre: Partial<DiActuelle> = {}): DiActuelle =>
  ({ id: 'd1', statut: 1, constat: 'Ampoule grillée', lieux: [{ id: 'c112', nom: 'Chambre 112' }], enAttente: [], ...autre })

Deno.test('nouveau ticket : DI à créer, chambre lue en tête, date de Paris', async () => {
  const d = await decider(fiche('#114 Fuite lavabo'), 200, undefined, undefined, locaux)
  assertEquals(d.type, 'creer')
  if (d.type !== 'creer') return
  assertEquals([d.constat, d.lieux, d.statut, d.cree_le], ['Fuite lavabo', ['c114'], 1, '2026-11-21 09:05:00 Europe/Paris'])
})

Deno.test('activité sans changement (commentaire) : on note seulement la date (D12)', async () => {
  const d = await decider(fiche('#112 Ampoule grillée'), 200, await lien('#112 Ampoule grillée'), di(), locaux)
  assertEquals(d, { type: 'ts', dmbook_id: '10', di_id: 'd1', ts: 200 })
})

Deno.test('statut seul changé : constat et lieux intacts (décisions PO historiques protégées)', async () => {
  // Le constat en base a été corrigé à la main : il ne doit pas être recalculé.
  const d = await decider(fiche('#112 ampoule grillee !!', 'ferme'), 200, await lien('#112 ampoule grillee !!'), di(), locaux)
  if (d.type !== 'maj') throw new Error(d.type)
  assertEquals([d.constat, d.lieux, d.statut, d.quoi], [null, null, 3, ['statut']])
})

Deno.test('rouvert dans Dmbook : Clôturé → Ouvert', async () => {
  const d = await decider(fiche('#112 Ampoule grillée', 'ouvert'), 200, await lien('#112 Ampoule grillée', 'ferme'), di({ statut: 3 }), locaux)
  if (d.type !== 'maj') throw new Error(d.type)
  assertEquals(d.statut, 1)
})

Deno.test('chambre changée dans Dmbook : nouveaux lieux et nouveau constat', async () => {
  const d = await decider(fiche('#114 Ampoule grillée'), 200, await lien('#112 Ampoule grillée'), di(), locaux)
  if (d.type !== 'maj') throw new Error(d.type)
  assertEquals([d.constat, d.lieux, d.quoi], [null, ['c114'], ['lieux']])
})

Deno.test('lieu choisi à la main gardé si le texte ne cite aucune chambre (D17)', async () => {
  const d = await decider(fiche('Sauna en panne totale'), 200, await lien('Sauna en panne', 'ouvert', { lieu_manuel: true }),
    di({ constat: 'Sauna en panne', lieux: [{ id: 'club', nom: 'Club' }] }), locaux)
  if (d.type !== 'maj') throw new Error(d.type)
  assertEquals([d.constat, d.lieux], ['Sauna en panne totale', null])
})

Deno.test('… mais une chambre citée l\'emporte sur le choix manuel (D17)', async () => {
  const d = await decider(fiche('#112 Sauna en panne'), 200, await lien('Sauna en panne', 'ouvert', { lieu_manuel: true }),
    di({ constat: 'Sauna en panne', lieux: [{ id: 'club', nom: 'Club' }] }), locaux)
  if (d.type !== 'maj') throw new Error(d.type)
  assertEquals(d.lieux, ['c112'])
})

Deno.test('citation ambiguë ou plus aucun lieu lisible : on ne retire jamais un lieu', async () => {
  const ambigu = await decider(fiche('Clé de la 114 introuvable'), 200, await lien('#112 Ampoule grillée'), di(), locaux)
  const muet = await decider(fiche('Ampoule toujours grillée'), 200, await lien('#112 Ampoule grillée'), di(), locaux)
  for (const d of [ambigu, muet]) {
    if (d.type !== 'maj') throw new Error(d.type)
    assertEquals(d.lieux, null)
  }
})

Deno.test('conflit : des actions Dédale attendaient, Dmbook gagne (D2 révisé)', async () => {
  const d = await decider(fiche('#112 Ampoule grillée', 'en_cours'), 200, await lien('#112 Ampoule grillée'), di({ enAttente: ['texte'] }), locaux)
  if (d.type !== 'maj') throw new Error(d.type)
  assertEquals([d.conflit, d.statut], [true, 2])
})

Deno.test('DI supprimée dans Dédale (suppression du ticket en file) : on ne la recrée pas', async () => {
  const d = await decider(fiche('#112 x'), 200, await lien('#112 x', 'ouvert', { di_id: null }), undefined, locaux)
  assertEquals(d.type, 'ignorer')
})

Deno.test('date Dmbook illisible → null (la base prendra maintenant)', () => {
  assertEquals(dateDmbook('hier'), null)
  assertEquals(dateDmbook('3 août 2026 à 07:45'), '2026-08-03 07:45:00 Europe/Paris')
})
