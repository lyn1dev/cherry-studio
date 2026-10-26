import { describe, expect, it } from 'vitest'

import { getTimeUntilUtcMidnight } from '../ChatComposerOpenRouterUsage'

describe('getTimeUntilUtcMidnight', () => {
  it('counts down to 00:00 UTC rather than local midnight', () => {
    expect(getTimeUntilUtcMidnight(new Date(Date.UTC(2026, 9, 26, 18, 30)))).toEqual({ hours: 5, minutes: 30 })
  })

  it('rounds a partial minute up so the countdown never shows zero early', () => {
    expect(getTimeUntilUtcMidnight(new Date(Date.UTC(2026, 9, 26, 23, 59, 30)))).toEqual({ hours: 0, minutes: 1 })
  })

  it('rolls over month ends', () => {
    expect(getTimeUntilUtcMidnight(new Date(Date.UTC(2026, 9, 31, 22, 0)))).toEqual({ hours: 2, minutes: 0 })
  })
})
