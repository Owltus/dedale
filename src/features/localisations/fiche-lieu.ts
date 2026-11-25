import type { ComponentType } from 'react'
import type { Json } from '@/lib/database.types'

/** Compteur « ouverts / total » d'un onglet (OT, DI, travaux, événements, gammes). */
export interface CompteurOuverts {
  /** Non terminés (gammes : actives). */
  ouverts: number
  total: number
}

/**
 * Compteurs de la fiche d'un lieu, tels que renvoyés par `fiche_local` (183).
 * `null` = onglet NON VISIBLE pour le rôle (la base le dit, le front masque) —
 * jamais un « 0 » trompeur.
 */
export interface CompteursLieu {
  equipements: number
  gammes: CompteurOuverts | null
  ot: CompteurOuverts | null
  di: CompteurOuverts
  travaux: CompteurOuverts | null
  evenements: CompteurOuverts | null
  documents: number | null
}

function estObjet(v: Json | undefined): v is Record<string, Json | undefined> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function nombre(v: Json | undefined): number | null {
  return typeof v === 'number' ? v : null
}

/** `{ <cleOuverts>, total }` → `CompteurOuverts`, `null` si absent ou mal formé. */
function ouvertsTotal(
  v: Json | undefined,
  cleOuverts: string,
): CompteurOuverts | null {
  if (!estObjet(v)) return null
  const ouverts = nombre(v[cleOuverts])
  const total = nombre(v.total)
  return ouverts === null || total === null ? null : { ouverts, total }
}

/**
 * Lit la réponse JSON de `fiche_local`. `null` quand le lieu est invisible
 * (NULL global) ou que la réponse n'a pas la forme attendue.
 */
export function lireCompteursLieu(fiche: Json): CompteursLieu | null {
  if (!estObjet(fiche) || !estObjet(fiche.compteurs)) return null
  const c = fiche.compteurs
  return {
    equipements: nombre(c.equipements) ?? 0,
    gammes: ouvertsTotal(c.gammes, 'actives'),
    ot: ouvertsTotal(c.ot, 'ouverts'),
    di: ouvertsTotal(c.di, 'ouvertes') ?? { ouverts: 0, total: 0 },
    travaux: ouvertsTotal(c.travaux, 'ouverts'),
    evenements: ouvertsTotal(c.evenements, 'ouverts'),
    documents: nombre(c.documents),
  }
}

/** Identifiant d'un onglet de la fiche d'un lieu. */
export type OngletLieu =
  | 'equipements'
  | 'gammes'
  | 'ot'
  | 'di'
  | 'travaux'
  | 'evenements'
  | 'documents'

/** Un onglet affiché : son id, son libellé et son compteur (absent = sans pastille). */
export interface OngletLieuAffiche {
  id: OngletLieu
  label: string
  count?: number
  /** Nombre total (tous statuts) : 0 → l'onglet rend directement son état vide. */
  total: number
}

/**
 * Onglets VISIBLES de la fiche, dans l'ordre d'affichage. Un compteur `null`
 * (rôle sans accès, ex. demandeur) masque l'onglet. La pastille montre ce que
 * la liste affiche par défaut : les non terminés (gammes : actives).
 * Documents : pas de pastille — le compteur de la base inclut les documents
 * des équipements du lieu, que l'onglet (documents du lieu) ne liste pas.
 */
export function ongletsVisibles(c: CompteursLieu): OngletLieuAffiche[] {
  const onglets: (OngletLieuAffiche | null)[] = [
    {
      id: 'equipements',
      label: 'Équipements',
      count: c.equipements,
      total: c.equipements,
    },
    c.gammes && {
      id: 'gammes',
      label: 'Plans de maintenance',
      count: c.gammes.ouverts,
      total: c.gammes.total,
    },
    c.ot && {
      id: 'ot',
      label: 'Ordres de travail',
      count: c.ot.ouverts,
      total: c.ot.total,
    },
    {
      id: 'di',
      label: 'Demandes',
      count: c.di.ouverts,
      total: c.di.total,
    },
    c.travaux && {
      id: 'travaux',
      label: 'Travaux',
      count: c.travaux.ouverts,
      total: c.travaux.total,
    },
    c.evenements && {
      id: 'evenements',
      label: 'Événements',
      count: c.evenements.ouverts,
      total: c.evenements.total,
    },
    c.documents === null
      ? null
      : { id: 'documents', label: 'Documents', total: c.documents },
  ]
  return onglets.filter((o): o is OngletLieuAffiche => o !== null)
}

/** Props communes d'un onglet de la fiche d'un lieu, fourni par sa feature. */
export interface OngletLieuProps {
  localId: string
  siteId: string
  /** Nombre total d'éléments (tous statuts) : 0 → état vide sans requête. */
  total: number
}

/**
 * Onglets de la fiche d'un lieu, INJECTÉS par la route : ils vivent dans leur
 * feature (équipements, gammes, OT, DI, travaux, événements), qui importent
 * toutes localisations — l'inverse créerait un cycle.
 */
export interface OngletsDuLieu {
  Equipements: ComponentType<OngletLieuProps>
  Gammes: ComponentType<OngletLieuProps>
  Ot: ComponentType<OngletLieuProps>
  Demandes: ComponentType<OngletLieuProps>
  Travaux: ComponentType<OngletLieuProps>
  Evenements: ComponentType<OngletLieuProps>
}
