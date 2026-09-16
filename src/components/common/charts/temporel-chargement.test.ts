import { describe, expect, it } from 'vitest'

/**
 * Le module `temporel` construit ses trois `Intl.DateTimeFormat` AU CHARGEMENT,
 * pas au moment de formater. Une locale ou une option de format invalide ne se
 * signale donc pas à l'appel : elle fait échouer l'IMPORT du module, et c'est
 * tout l'écran des relevés qui reste blanc.
 *
 * Ce contrôle vit dans un fichier à part, avec un import DYNAMIQUE : dans
 * `temporel.test.ts`, l'import statique emporterait le fichier entier avant
 * qu'un seul test n'ait pu constater quoi que ce soit — l'échec passerait alors
 * pour une absence de test, pas pour un test rouge.
 */
describe('chargement du module temporel', () => {
  it('s’importe sans lever, et ses trois formateurs répondent aussitôt', async () => {
    // ORACLE : un module de présentation ne doit rien faire échouer au simple
    // fait d'être importé. Les trois formateurs (repère annuel, repère mensuel,
    // date complète) doivent donc être utilisables immédiatement après le
    // chargement et rendre un libellé non vide.
    const mod = await import('./temporel')
    const quand = new Date(2024, 5, 15).getTime()
    expect(mod.labelRepere(quand, 'annee')).not.toBe('')
    expect(mod.labelRepere(quand, 'mois')).not.toBe('')
    expect(mod.labelRepere(quand, 'trimestre')).not.toBe('')
    expect(mod.labelDateComplete(quand)).not.toBe('')
  })
})
