/**
 * Client Dmbook « maison » pour la synchro Dmbook ⇄ Dédale (plan sync-dmbook, étape 2).
 * Porté depuis le prototype poc-dmbook.local/dmbook.ts (19-20/11/2026).
 *
 * Dmbook n'a pas d'API pour les tickets : pages HTML rendues par le serveur,
 * écritures par formulaires protégés par `csrf_token`. Ce client fait ce que fait
 * le navigateur, rien de plus.
 *
 * Garde-fous (non négociables, consignes PO) :
 *   - connexion : UNE tentative ; si LoungeUp demande un code e-mail → arrêt et
 *     reprise rendue à l'appelant, jamais de « renvoyer le code » (pas de spam) ;
 *   - écritures verrouillées par défaut (`ecritureAutorisee`) ;
 *   - plafond de requêtes par instance (anti-boucle) ;
 *   - `existe()` ne répond « supprimé » que sur une vraie 404 « Page introuvable ».
 * L'adresse Dmbook et le carnet viennent de la configuration (jamais écrits ici :
 * le dépôt est public).
 */
import { DOMParser } from 'npm:linkedom@0.18.12'

export const STATUT = { ouvert: '1003', en_cours: '5209', ferme: '1004' } as const
export type Statut = keyof typeof STATUT
const STATUT_PAR_CLASSE: Record<string, Statut> = {
  'ticket-status-bg-open': 'ouvert',
  'ticket-status-bg-wait': 'en_cours',
  'ticket-status-bg-close': 'ferme',
}
const STATUT_PAR_LIBELLE: Record<string, Statut> = { Ouvert: 'ouvert', 'En cours': 'en_cours', Fermé: 'ferme' }

export type Cookie = { dom: string; nom: string; val: string }
export type Reprise = { action: string; champs: Record<string, string>; champCode: string }
export type ResultatConnexion = { etat: 'connecte' } | { etat: 'code_requis'; message: string; reprise: Reprise }

export type TicketResume = {
  id: string
  numero: number | null
  /** data-ts : horodatage de la dernière activité sur le ticket (secondes). */
  modifieLe: number
  /** Titre affiché dans la liste (1re ligne retouchée), sans le suffixe auteur / statut. */
  titre: string
  statut: Statut | null
  creeLe: string | null
}

export type TicketDetail = {
  id: string
  numero: number | null
  /** Titre (h2) + corps, comme à l'import : c'est la base de l'empreinte Dmbook. */
  texte: string
  statut: Statut | null
  creeLe: string | null
}

export class SessionExpiree extends Error {
  constructor() {
    super('Session Dmbook expirée')
  }
}

class PotDeCookies {
  #c = new Map<string, Cookie>()
  absorber(url: string, res: Response) {
    const hote = new URL(url).hostname
    for (const sc of res.headers.getSetCookie()) {
      const [paire, ...attrs] = sc.split(';')
      const i = paire.indexOf('=')
      const nom = paire.slice(0, i).trim()
      const val = paire.slice(i + 1).trim()
      const domAttr = attrs.map((a) => a.trim()).find((a) => /^domain=/i.test(a))
      const dom = domAttr ? domAttr.slice(7).replace(/^\./, '').toLowerCase() : hote
      const expire = attrs.some((a) => /^max-age=0$/i.test(a.trim())) || val === '' || val === 'deleted'
      const cle = dom + '|' + nom
      if (expire) this.#c.delete(cle)
      else this.#c.set(cle, { dom, nom, val })
    }
  }
  exporter() {
    return [...this.#c.values()]
  }
  importer(liste: Cookie[]) {
    for (const c of liste) this.#c.set(c.dom + '|' + c.nom, c)
  }
  pour(url: string) {
    const hote = new URL(url).hostname
    return [...this.#c.values()]
      .filter((c) => hote === c.dom || hote.endsWith('.' + c.dom))
      .map((c) => `${c.nom}=${c.val}`)
      .join('; ')
  }
}

const parser = new DOMParser()
const doc = (html: string) => parser.parseFromString(html, 'text/html')
// deno-lint-ignore no-explicit-any
type El = any
const txt = (e: El) => ((e?.textContent as string | undefined) ?? '').replace(/\s+/g, ' ').trim()
const lettres = (s: string) => s.toLowerCase().replace(/[^a-zà-ÿ]/g, '')
/** Décode les entités HTML d'un texte brut (« &amp; » → « & »), sans interpréter de balise. */
const decoder = (brut: string) => (doc(`<p>${brut.replace(/</g, '&lt;')}</p>`).querySelector('p')?.textContent as string) ?? brut

export type OptionsClient = {
  base: string
  carnet: string
  /** Nombre maximal de requêtes pour cette instance (un passage de synchro). */
  plafond?: number
  /** Journal sans donnée sensible (méthode, code HTTP, chemin). */
  trace?: (ligne: string) => void
  /** Injection pour les tests. */
  fetch?: typeof fetch
}

export class Dmbook {
  #pot = new PotDeCookies()
  #fetch: typeof fetch
  #plafond: number
  #trace?: (l: string) => void
  readonly base: string
  readonly carnet: string
  requetes = 0
  /** Garde-fou : aucune écriture tant que ce n'est pas explicitement ouvert. */
  ecritureAutorisee = false

  constructor(o: OptionsClient) {
    this.base = o.base.replace(/\/$/, '')
    this.carnet = o.carnet
    this.#plafond = o.plafond ?? 150
    this.#trace = o.trace
    this.#fetch = o.fetch ?? fetch
  }

  exporterSession() {
    return this.#pot.exporter()
  }
  importerSession(s: Cookie[]) {
    this.#pot.importer(s)
  }

  /** Requête avec cookies, redirections suivies à la main (cookies à chaque saut). */
  async #req(url: string, init: RequestInit = {}, sauts = 0): Promise<{ url: string; res: Response; html: string }> {
    if (sauts > 15) throw new Error('Trop de redirections')
    if (++this.requetes > this.#plafond) throw new Error(`Plafond de ${this.#plafond} requêtes Dmbook atteint — arrêt.`)
    const headers = new Headers(init.headers)
    const ck = this.#pot.pour(url)
    if (ck) headers.set('cookie', ck)
    headers.set('user-agent', 'Mozilla/5.0 (Dedale-synchro)')
    const res = await this.#fetch(url, { ...init, headers, redirect: 'manual' })
    this.#pot.absorber(url, res)
    const loc = res.headers.get('location')
    const u = new URL(url)
    this.#trace?.(`${init.method ?? 'GET'} ${res.status} ${u.hostname}${u.pathname}`)
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel()
      return this.#req(new URL(loc, url).toString(), { method: 'GET' }, sauts + 1)
    }
    return { url, res, html: await res.text() }
  }

  #estPageDeRenvoi(html: string) {
    // Non connecté : petite page qui redirige en JS vers app.dmbook.pro/signin.
    return /window\.location\s*=\s*["']https:\/\/app\.dmbook\.pro\/signin/.test(html)
  }

  /** Lit le formulaire d'une page Keycloak : action + champs cachés + champs à saisir. */
  #formulaire(html: string) {
    const d = doc(html)
    const form = d.querySelector('form[action*="login-actions"], #kc-form-login, form[method=post]')
    if (!form) return null
    const champs: Record<string, string> = {}
    const aSaisir: string[] = []
    for (const i of form.querySelectorAll('input[name]')) {
      const nom = i.getAttribute('name')!
      const type = (i.getAttribute('type') ?? 'text').toLowerCase()
      if (type === 'checkbox' || type === 'submit') continue
      if (type === 'hidden') champs[nom] = i.getAttribute('value') ?? ''
      else aSaisir.push(nom)
    }
    const message = txt(d.querySelector('#input-error, .kc-feedback-text, .alert-error, .alert-warning, .alert-info, [class*="alert"]'))
    return { action: (form.getAttribute('action') as string).replace(/&amp;/g, '&'), champs, aSaisir, message }
  }

  async connecte(): Promise<boolean> {
    const { html } = await this.#req(`${this.base}/tickets/${this.carnet}`)
    return !this.#estPageDeRenvoi(html) && html.includes('entry ticket')
  }

  /**
   * Connexion SANS JAMAIS insister : session valide → rien n'est envoyé ; sinon
   * identifiant puis mot de passe, UNE fois chacun ; code demandé → reprise rendue.
   */
  async connecter(identifiant: string, motDePasse: string): Promise<ResultatConnexion> {
    let page = await this.#req(`${this.base}/tickets/${this.carnet}`)
    if (!this.#estPageDeRenvoi(page.html)) return { etat: 'connecte' }
    const signin = page.html.match(/window\.location\s*=\s*["']([^"']+)["']/)![1]
    page = await this.#req(signin)
    const envoyes = new Set<string>()
    for (let etape = 0; etape < 3; etape++) {
      if (new URL(page.url).hostname !== 'id.loungeup.com') break
      const f = this.#formulaire(page.html)
      if (!f) throw new Error('Page de connexion inattendue — arrêt.')
      const veutId = f.aSaisir.includes('username')
      const veutMdp = f.aSaisir.includes('password')
      if (!veutId && !veutMdp) {
        // Écran du code e-mail (champ emailCode). Jamais « resend » : ce serait un nouvel e-mail.
        const champCode = f.aSaisir.find((n) => /code|otp/i.test(n))
        if (!champCode) throw new Error(`Écran de connexion inconnu (champs : ${f.aSaisir.join(', ') || 'aucun'}) — arrêt.`)
        return { etat: 'code_requis', message: f.message, reprise: { action: f.action, champs: f.champs, champCode } }
      }
      if ((veutId && envoyes.has('username')) || (veutMdp && envoyes.has('password')))
        throw new Error(`Connexion refusée : ${f.message || 'identifiants non acceptés'} — aucun nouvel essai.`)
      const corps = new URLSearchParams(f.champs)
      if (page.html.includes('name="rememberMe"')) corps.set('rememberMe', 'on')
      if (veutId) { corps.set('username', identifiant); envoyes.add('username') }
      if (veutMdp) { corps.set('password', motDePasse); envoyes.add('password') }
      page = await this.#req(f.action, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corps })
    }
    if (!(await this.connecte())) throw new Error('Connexion non aboutie — arrêt.')
    return { etat: 'connecte' }
  }

  /** Envoie le code reçu par e-mail, UNE fois, puis « faire confiance à cet appareil » = Oui. */
  async fournirCode(reprise: Reprise, code: string) {
    const corps = new URLSearchParams(reprise.champs)
    corps.set(reprise.champCode, code.trim())
    let p = await this.#req(reprise.action, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corps })
    if (new URL(p.url).pathname.endsWith('required-action')) {
      const d = doc(p.html)
      const form = d.querySelector('form[method=post], form')
      const boutons: El[] = form ? [...form.querySelectorAll('button[name], input[type=submit][name]')] : []
      const libelle = (b: El) => `${txt(b)} ${b.getAttribute('value') ?? ''}`
      const oui = boutons.find((b) => /\b(oui|yes|trust|confiance)\b/i.test(`${libelle(b)} ${b.getAttribute('name') ?? ''}`) && !/\b(non|no)\b/i.test(libelle(b)))
      if (form && oui) {
        const c = new URLSearchParams()
        for (const i of form.querySelectorAll('input[type=hidden][name]')) c.set(i.getAttribute('name')!, i.getAttribute('value') ?? '')
        c.set(oui.getAttribute('name')!, oui.getAttribute('value') ?? '')
        p = await this.#req(new URL((form.getAttribute('action') as string).replace(/&amp;/g, '&'), p.url).toString(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: c })
      }
    }
    if (new URL(p.url).hostname === 'id.loungeup.com') {
      const f = this.#formulaire(p.html)
      throw new Error(`Code refusé ou écran inattendu : ${f?.message || 'aucun message'} — aucun nouvel envoi.`)
    }
    if (!(await this.connecte())) throw new Error('Connexion non aboutie après le code — arrêt.')
  }

  // --- Lecture -----------------------------------------------------------------

  #urlListe(page: number, statuts: Statut[]) {
    const p = new URLSearchParams({ page: String(page), sort: '-created_at' })
    for (const v of ['10', '20', '30']) p.append('priority[]', v)
    for (const v of ['-1', '-2', '-3']) p.append('status[]', v)
    for (const s of statuts) p.append('status_custom[]', STATUT[s])
    return `${this.base}/tickets/${this.carnet}?${p}`
  }

  /** Une page de la liste (50 tickets), du plus récent au plus ancien. */
  async lister(page = 1, statuts: Statut[] = ['ouvert', 'en_cours', 'ferme']): Promise<{ total: number; tickets: TicketResume[] }> {
    const { html } = await this.#req(this.#urlListe(page, statuts))
    if (this.#estPageDeRenvoi(html)) throw new SessionExpiree()
    return lireListe(html)
  }

  /** Une page de la liste en lecture légère (voir `lireListeLegere`). */
  async listerLeger(page = 1, statuts: Statut[] = ['ouvert', 'en_cours', 'ferme']): Promise<{ total: number; tickets: TicketLeger[] }> {
    const { html } = await this.#req(this.#urlListe(page, statuts))
    if (this.#estPageDeRenvoi(html)) throw new SessionExpiree()
    return lireListeLegere(html)
  }

  /**
   * Toute la liste. `complet` n'est vrai que si le nombre lu égale le total affiché
   * par Dmbook : condition OBLIGATOIRE avant de conclure qu'un ticket a disparu.
   */
  async listerTout(pauseMs = 300, de = 1, a = 500, statuts: Statut[] = ['ouvert', 'en_cours', 'ferme']): Promise<{ total: number; tickets: TicketLeger[]; complet: boolean; derniere: number; fini: boolean }> {
    const tous = new Map<string, TicketLeger>()
    let total = -1
    let derniere = de - 1
    let fini = false
    for (let page = de; page <= a; page++) {
      const r = await this.listerLeger(page, statuts)
      derniere = page
      if (total < 0) total = r.total
      for (const t of r.tickets) tous.set(t.id, t)
      if (r.tickets.length < 50) { fini = true; break }
      await new Promise((ok) => setTimeout(ok, pauseMs))
    }
    // « complet » : lecture partie de la page 1, allée jusqu'au bout, et autant de tickets que le total affiché.
    return { total, tickets: [...tous.values()], complet: de === 1 && fini && total > 0 && tous.size === total, derniere, fini }
  }

  async detail(id: string): Promise<TicketDetail> {
    const { html } = await this.#req(`${this.base}/ticket/${id}`)
    if (this.#estPageDeRenvoi(html)) throw new SessionExpiree()
    return lireFiche(id, html)
  }

  /**
   * Le ticket existe-t-il encore ? « supprime » UNIQUEMENT sur une vraie 404
   * « Page introuvable » ; tout le reste (session, panne, page inattendue) = « inconnu ».
   */
  async existe(id: string): Promise<'present' | 'supprime' | 'inconnu'> {
    try {
      const { res, html } = await this.#req(`${this.base}/ticket/${id}`)
      if (res.status === 404 && /Page introuvable/i.test(html) && !this.#estPageDeRenvoi(html)) return 'supprime'
      if (res.status === 200 && html.includes('entry-ticket') && !this.#estPageDeRenvoi(html)) return 'present'
      return 'inconnu'
    } catch {
      return 'inconnu'
    }
  }

  /** Formulaire « Éditer » : texte BRUT exact du ticket + champs à renvoyer tels quels. */
  async formulaireEdition(id: string): Promise<{ texte: string; action: string; champs: URLSearchParams }> {
    const { html } = await this.#req(`${this.base}/ticket/${id}/update?return_to=show`)
    if (this.#estPageDeRenvoi(html)) throw new SessionExpiree()
    return lireEdition(id, html, this.base)
  }

  // --- Écritures (verrouillées par défaut) ---------------------------------------

  #verrou() {
    if (!this.ecritureAutorisee) throw new Error('Écriture Dmbook verrouillée (ecritureAutorisee = false)')
  }

  async #csrf(url: string, selecteur: string) {
    const { html } = await this.#req(url)
    if (this.#estPageDeRenvoi(html)) throw new SessionExpiree()
    const form = doc(html).querySelector(selecteur)
    if (!form) throw new Error(`Formulaire introuvable (${selecteur})`)
    const champs = new URLSearchParams()
    for (const i of form.querySelectorAll('input[name]'))
      if ((i.getAttribute('type') ?? '') !== 'file') champs.set(i.getAttribute('name')!, i.getAttribute('value') ?? '')
    return { champs, action: new URL((form.getAttribute('action') as string).replace(/&amp;/g, '&'), this.base).toString() }
  }

  async #poster(action: string, corps: URLSearchParams, quoi: string) {
    const { res, html } = await this.#req(action, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corps })
    if (this.#estPageDeRenvoi(html)) throw new SessionExpiree()
    if (!res.ok) throw new Error(`${quoi} refusé par Dmbook (${res.status})`)
  }

  async changerStatut(id: string, statut: Statut) {
    this.#verrou()
    const { champs, action } = await this.#csrf(`${this.base}/ticket/${id}`, `form[action*="/ticket/${id}/setTicketStatus?ticket_status_id=${STATUT[statut]}"]`)
    await this.#poster(action, champs, 'Changement de statut')
  }

  /** Remplace le texte ; échéance, priorité, pièces jointes… sont renvoyées inchangées. */
  async modifierTexte(id: string, texte: string) {
    this.#verrou()
    const f = await this.formulaireEdition(id)
    f.champs.set('content', texte)
    await this.#poster(f.action, f.champs, 'Modification du texte')
  }

  async creer(texte: string) {
    this.#verrou()
    const { champs, action } = await this.#csrf(`${this.base}/tickets/${this.carnet}/create`, 'form[method=post][enctype], form[method=post]')
    champs.set('content', texte)
    await this.#poster(action, champs, 'Création')
  }

  async supprimer(id: string) {
    this.#verrou()
    const { champs, action } = await this.#csrf(`${this.base}/ticket/${id}`, `form[action*="/entries/delete?id=${id}"]`)
    await this.#poster(action, champs, 'Suppression')
  }
}

// --- Lecture des pages (fonctions pures, testées sur des pages fabriquées) -------

export function lireListe(html: string): { total: number; tickets: TicketResume[] } {
  const d = doc(html)
  const total = Number(txt(d.body).match(/Total\s*:\s*(\d+)/)?.[1] ?? 0)
  const tickets = ([...d.querySelectorAll('tr.entry.ticket')] as El[]).map((r) => {
    const meta = txt(r.querySelector('.meta')) // « #7029 - Fermé - Aujourd'hui »
    return {
      id: r.getAttribute('data-id') as string,
      modifieLe: Number(r.getAttribute('data-ts')),
      numero: Number(meta.match(/#(\d+)/)?.[1]) || null,
      titre: txt(r.querySelector('.content')).replace(/\s—\s[^—]*#\d+\s-\s[^—]*$/, ''),
      statut: STATUT_PAR_LIBELLE[meta.split(' - ')[1] ?? ''] ?? null,
      creeLe: txt(r.querySelector('.dropdown-header')).match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)?.[0] ?? null,
    }
  })
  return { total, tickets }
}

export type TicketLeger = Omit<TicketResume, 'titre' | 'creeLe'>

/**
 * Lecture LÉGÈRE d'une page de liste, sans construire de DOM : identifiant,
 * activité (data-ts), numéro et statut. C'est ce qu'il faut pour comparer, et ça
 * tient dans le temps de calcul d'une fonction serveur (≈ 350 Ko par page ; le
 * DOM complet de 82 pages dépassait la limite, constaté le 22/11/2026).
 */
export function lireListeLegere(html: string): { total: number; tickets: TicketLeger[] } {
  const total = Number(html.match(/Total\s*:\s*(?:<[^>]+>\s*)*(\d+)/)?.[1] ?? 0)
  const morceaux = html.split(/<tr\s+class="entry ticket"/).slice(1)
  const tickets = morceaux.map((m) => {
    const meta = m.match(/class="meta"[^>]*>\s*#(\d+)\s*-\s*([^<]*?)\s*-[^<]*</)
    return {
      id: m.match(/\bdata-id="(\d+)"/)?.[1] ?? '',
      modifieLe: Number(m.match(/\bdata-ts="(\d+)"/)?.[1] ?? 0),
      numero: meta ? Number(meta[1]) : null,
      statut: STATUT_PAR_LIBELLE[meta?.[2].trim() ?? ''] ?? null,
    }
  })
  if (tickets.some((t) => !t.id || !t.modifieLe)) throw new Error('Page de liste Dmbook illisible (format inattendu).')
  return { total, tickets }
}

export function lireFiche(id: string, html: string): TicketDetail {
  const d = doc(html)
  const entree = d.querySelector('.entry-ticket')
  if (!entree) throw new Error(`Fiche ${id} illisible`)
  const classe: string = d.querySelector('.ticket-meta .label')?.getAttribute('class') ?? ''
  const corps = txt(entree.querySelector('.content'))
  const h2 = d.querySelector('h2')
  // Le h2 contient aussi les boutons « Éditer » / « Nouveau ticket » : on ne garde que ses textes directs et les liens « #631 ».
  const titre = h2
    ? ([...h2.childNodes] as El[])
        .filter((n) => n.nodeType === 3 || (n.tagName === 'A' && (n.getAttribute('href') ?? '').startsWith('/search')))
        .map((n) => n.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    : ''
  // Ticket d'une ligne : le titre est une copie retouchée du corps → ignoré.
  const texte = titre && !lettres(corps).includes(lettres(titre)) ? `${titre}\n${corps}` : corps
  const blocs = ([...d.querySelectorAll('.ticket-deadline')] as El[]).map(txt)
  return {
    id,
    numero: Number(txt(d.querySelector('.ticket-number')).match(/#(\d+)/)?.[1]) || null,
    texte,
    statut: Object.entries(STATUT_PAR_CLASSE).find(([c]) => classe.includes(c))?.[1] ?? null,
    creeLe: blocs.find((b) => b.startsWith('Date de création'))?.replace('Date de création ', '') ?? null,
  }
}

export function lireEdition(id: string, html: string, base: string) {
  const form = doc(html).querySelector(`form[action*="/ticket/${id}/update"]`)
  if (!form) throw new Error(`Formulaire d'édition du ticket ${id} introuvable`)
  const champs = new URLSearchParams()
  for (const i of form.querySelectorAll('input[name], textarea[name], select[name]') as El[]) {
    const nom = i.getAttribute('name') as string
    const balise = (i.tagName as string).toLowerCase()
    if (balise === 'input' && (i.getAttribute('type') ?? '') === 'file') continue
    // linkedom laisse les entités du textarea telles quelles (« &amp; ») : on les décode comme un
    // navigateur, sinon chaque renvoi abîmerait le texte Dmbook (« & » → « &amp; » → « &amp;amp; »).
    if (balise === 'textarea') champs.set(nom, decoder(i.innerHTML ?? i.textContent ?? ''))
    else if (balise === 'select') champs.set(nom, (i.querySelector('option[selected]') ?? i.querySelector('option'))?.getAttribute('value') ?? '')
    else champs.set(nom, i.getAttribute('value') ?? '')
  }
  return {
    texte: (champs.get('content') ?? '').replace(/\r\n/g, '\n'),
    action: new URL((form.getAttribute('action') as string).replace(/&amp;/g, '&'), base).toString(),
    champs,
  }
}
