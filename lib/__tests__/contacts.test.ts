import { describe, it, expect } from 'vitest'
import {
  lastActivityMs, daysSince, isDormant, canMessageWhatsapp, DORMANT_DAYS,
} from '../contacts'

const NOW = new Date('2026-07-01T12:00:00Z').getTime()
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

describe('lastActivityMs', () => {
  it('is null with no activity', () => {
    expect(lastActivityMs({})).toBeNull()
    expect(lastActivityMs({ classes: [], practice_sessions: [] })).toBeNull()
  })

  it('takes the most recent across classes and practice sessions', () => {
    const s = {
      classes: [{ date: daysAgo(30) }, { date: daysAgo(10) }],
      practice_sessions: [{ date: daysAgo(3) }],
    }
    expect(lastActivityMs(s)).toBe(Date.parse(daysAgo(3)))
  })

  it('ignores unparseable dates', () => {
    const s = { classes: [{ date: 'not-a-date' }], practice_sessions: [{ date: daysAgo(5) }] }
    expect(lastActivityMs(s)).toBe(Date.parse(daysAgo(5)))
  })
})

describe('daysSince', () => {
  it('is null for null input', () => {
    expect(daysSince(null, NOW)).toBeNull()
  })

  it('counts whole days elapsed', () => {
    expect(daysSince(Date.parse(daysAgo(7)), NOW)).toBe(7)
  })
})

describe('isDormant', () => {
  it('is dormant when there is no activity at all', () => {
    expect(isDormant({}, NOW)).toBe(true)
  })

  it('is not dormant with recent activity', () => {
    expect(isDormant({ practice_sessions: [{ date: daysAgo(2) }] }, NOW)).toBe(false)
  })

  it('is dormant past the threshold', () => {
    expect(isDormant({ classes: [{ date: daysAgo(DORMANT_DAYS + 1) }] }, NOW)).toBe(true)
  })

  it('is not dormant exactly one day inside the threshold', () => {
    expect(isDormant({ classes: [{ date: daysAgo(DORMANT_DAYS - 1) }] }, NOW)).toBe(false)
  })
})

describe('canMessageWhatsapp', () => {
  it('needs both a phone and a consent timestamp', () => {
    expect(canMessageWhatsapp({ phone: '+34600111222', whatsapp_opt_in_at: daysAgo(1) })).toBe(true)
    expect(canMessageWhatsapp({ phone: '+34600111222', whatsapp_opt_in_at: null })).toBe(false)
    expect(canMessageWhatsapp({ phone: null, whatsapp_opt_in_at: daysAgo(1) })).toBe(false)
    expect(canMessageWhatsapp({ phone: '   ', whatsapp_opt_in_at: daysAgo(1) })).toBe(false)
    expect(canMessageWhatsapp({})).toBe(false)
  })
})
