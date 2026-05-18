import { describe, it, expect } from 'vitest'
import { computeClipPriority, pickTopClipsForToday, type SessionInput } from '../prioritization'

function mkSession(over: Partial<SessionInput> & { daysAgo: number; clipId: string }): SessionInput {
  const date = new Date(Date.now() - over.daysAgo * 24 * 60 * 60 * 1000).toISOString()
  return {
    clip_id: over.clipId,
    date,
    overall_score: over.overall_score ?? 80,
  }
}

describe('computeClipPriority', () => {
  const NOW = new Date('2026-05-18T12:00:00Z')

  it('returns max urgency for a clip with no sessions', () => {
    const p = computeClipPriority('clip-1', [], NOW)
    expect(p.daysSincePractice).toBeNull()
    expect(p.avgRecentScore).toBeNull()
    expect(p.sessionCount).toBe(0)
    // 14 * 0.4 + (1 - 0) * 0.6 = 5.6 + 0.6 = 6.2
    expect(p.priority).toBeCloseTo(6.2, 4)
  })

  it('low priority when score is high and practiced recently', () => {
    const sessions: SessionInput[] = [
      { clip_id: 'a', date: new Date(NOW.getTime() - 3600_000).toISOString(), overall_score: 100 },
      { clip_id: 'a', date: new Date(NOW.getTime() - 7200_000).toISOString(), overall_score: 95 },
    ]
    const p = computeClipPriority('a', sessions, NOW)
    expect(p.daysSincePractice).toBeLessThan(0.1)
    expect(p.avgRecentScore).toBeCloseTo(0.975, 3)
    // ~0 * 0.4 + (1 - 0.975) * 0.6 = 0.015
    expect(p.priority).toBeLessThan(0.1)
  })

  it('high priority for poor recent score even if practiced today', () => {
    const sessions: SessionInput[] = [
      { clip_id: 'a', date: new Date(NOW.getTime() - 3600_000).toISOString(), overall_score: 20 },
    ]
    const p = computeClipPriority('a', sessions, NOW)
    expect(p.priority).toBeGreaterThan(0.4) // (1 - 0.2) * 0.6 dominates
  })

  it('matches sessions linked via legacy checkpoint_id', () => {
    const sessions: SessionInput[] = [
      { checkpoint_id: 'legacy-1', date: new Date(NOW.getTime() - 86400_000).toISOString(), overall_score: 60 },
    ]
    const p = computeClipPriority('legacy-1', sessions, NOW)
    expect(p.sessionCount).toBe(1)
    expect(p.daysSincePractice).toBeCloseTo(1, 1)
  })

  it('only averages the last 3 recent sessions for the score component', () => {
    // 4 sessions with scores 100, 100, 100, 0. Most recent first when sorted.
    // The function sorts internally; we just check it considers only the
    // 3 most-recent dates regardless of input order.
    const baseMs = NOW.getTime()
    const sessions: SessionInput[] = [
      { clip_id: 'x', date: new Date(baseMs - 10 * 86400_000).toISOString(), overall_score: 0 },   // oldest
      { clip_id: 'x', date: new Date(baseMs - 3 * 86400_000).toISOString(), overall_score: 100 },
      { clip_id: 'x', date: new Date(baseMs - 2 * 86400_000).toISOString(), overall_score: 100 },
      { clip_id: 'x', date: new Date(baseMs - 1 * 86400_000).toISOString(), overall_score: 100 },  // newest
    ]
    const p = computeClipPriority('x', sessions, NOW)
    expect(p.avgRecentScore).toBeCloseTo(1, 3) // older 0 ignored
  })
})

describe('pickTopClipsForToday', () => {
  it('ranks never-practiced above any practiced clip', () => {
    const NOW = new Date('2026-05-18T12:00:00Z')
    const clips = [{ id: 'practiced-poorly' }, { id: 'never-touched' }]
    const sessions: SessionInput[] = [
      mkSession({ clipId: 'practiced-poorly', daysAgo: 10, overall_score: 0 }),
    ]
    const ranked = pickTopClipsForToday(clips, sessions, 2, NOW)
    // never-touched: 14*0.4 + 1*0.6 = 6.2
    // practiced-poorly: 10*0.4 + 1*0.6 = 4.6
    expect(ranked[0].id).toBe('never-touched')
    expect(ranked[1].id).toBe('practiced-poorly')
  })

  it('places a fresh, high-scoring clip at the bottom of the priority list', () => {
    const NOW = new Date('2026-05-18T12:00:00Z')
    const clips = [
      { id: 'fresh-good' },
      { id: 'stale-bad' },
    ]
    const sessions: SessionInput[] = [
      mkSession({ clipId: 'fresh-good', daysAgo: 0.1, overall_score: 100 }),
      mkSession({ clipId: 'stale-bad', daysAgo: 10, overall_score: 20 }),
    ]
    const ranked = pickTopClipsForToday(clips, sessions, 2, NOW)
    expect(ranked[0].id).toBe('stale-bad')
    expect(ranked[1].id).toBe('fresh-good')
  })

  it('caps the output at n', () => {
    const clips = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const ranked = pickTopClipsForToday(clips, [], 2)
    expect(ranked).toHaveLength(2)
  })
})
