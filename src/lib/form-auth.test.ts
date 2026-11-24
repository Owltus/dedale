import { describe, expect, it } from 'vitest'
import { messageErreurAuth } from './form'

describe('messageErreurAuth', () => {
  it('traduit les codes GoTrue connus', () => {
    expect(
      messageErreurAuth({
        code: 'invalid_credentials',
        message: 'Invalid login credentials',
      }),
    ).toBe('E-mail ou mot de passe incorrect.')
    expect(messageErreurAuth({ code: 'same_password' })).toBe(
      'Le nouveau mot de passe doit être différent de l’actuel.',
    )
  })

  it('code inconnu ou absent → message de repli français (jamais le texte anglais)', () => {
    expect(messageErreurAuth({ code: 'zzz', message: 'Something odd' })).toBe(
      'La connexion a échoué. Réessayez dans un instant.',
    )
    expect(messageErreurAuth(new Error('Network'), 'Repli')).toBe('Repli')
  })
})
