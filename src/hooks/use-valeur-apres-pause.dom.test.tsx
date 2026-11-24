import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useValeurApresPause } from './use-valeur-apres-pause'

describe('useValeurApresPause', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('ne transmet la valeur qu’après la pause, et seulement la dernière', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useValeurApresPause(v, 250),
      { initialProps: { v: '' } },
    )
    rerender({ v: 'p' })
    act(() => vi.advanceTimersByTime(100))
    rerender({ v: 'pe' })
    act(() => vi.advanceTimersByTime(249))
    expect(result.current).toBe('')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('pe')
  })
})
