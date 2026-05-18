import { describe, it, expect } from 'vitest'
import { clipTrend, weeklyStats, clipScoreSummary, type SessionLike } from '../trends'

const NOW = new Date('2026-05-18T12:00:00Z')

function s(clipId: string, daysAgo: number, overall_score: number): SessionLike {
  return {
    clip_id: clipId,
    date: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    overall_score,
  }
}

describe('clipTrend', () => {
  it('noData when there are no sessions', () => {
    expect(clipTrend([], 'a')).toBe('noData')
  })

  it('newish when there is exactly one session', () => {
    expect(clipTrend([s('a', 1, 60)], 'a')).toBe('newish')
  })

  it('improved when score climbed > 10 between first and last', () => {
    const sessions = [s('a', 5, 50), s('a', 3, 65), s('a', 1, 75)]
    expect(clipTrend(sessions, 'a')).toBe('improved')
  })

  it('declining when score dropped > 10', () => {
    const sessions = [s('a', 5, 90), s('a', 3, 75), s('a', 1, 70)]
    expect(clipTrend(sessions, 'a')).toBe('declining')
  })

  it('stagnant when 3+ recent sessions stay within 5 pp', () => {
    const sessions = [s('a', 5, 72), s('a', 3, 74), s('a', 1, 70)]
    // Range = 74 - 70 = 4 ≤ 5 → stagnant
    expect(clipTrend(sessions, 'a')).toBe('stagnant')
  })

  it('prefers stagnant over the diff-based heuristics', () => {
    // First and last differ by 8 (not enough for improved), but the 3-session
    // window is tight enough to read as stagnant.
    const sessions = [s('a', 5, 65), s('a', 3, 67), s('a', 1, 70)]
    expect(clipTrend(sessions, 'a')).toBe('stagnant')
  })

  it('matches sessions linked via legacy checkpoint_id', () => {
    const sessions: SessionLike[] = [
      { checkpoint_id: 'legacy', date: new Date(NOW.getTime() - 5 * 86_400_000).toISOString(), overall_score: 50 },
      { checkpoint_id: 'legacy', date: new Date(NOW.getTime() - 1 * 86_400_000).toISOString(), overall_score: 80 },
    ]
    expect(clipTrend(sessions, 'legacy')).toBe('improved')
  })

  it('ignores sessions belonging to other clips', () => {
    const sessions = [
      s('other', 5, 10),
      s('mine', 1, 60),
    ]
    expect(clipTrend(sessions, 'mine')).toBe('newish')
  })
})

describe('weeklyStats', () => {
  it('counts only sessions inside the last 7 days', () => {
    const sessions = [
      s('a', 0.5, 70),
      s('a', 6, 60),
      s('a', 9, 50), // outside the window
    ]
    const w = weeklyStats(sessions, ['a'], NOW)
    expect(w.sessionsCount).toBe(2)
  })

  it('collects improved and stagnant clip IDs across all-time data', () => {
    const sessions = [
      // 'imp' improved
      s('imp', 5, 50),
      s('imp', 3, 70),
      s('imp', 1, 80),
      // 'st' stagnant
      s('st', 5, 70),
      s('st', 3, 72),
      s('st', 1, 71),
      // 'new' newish — only one session
      s('new', 1, 90),
    ]
    const w = weeklyStats(sessions, ['imp', 'st', 'new'], NOW)
    expect(w.improvedClipIds).toEqual(['imp'])
    expect(w.stagnantClipIds).toEqual(['st'])
  })

  it('reports practicedClipIds covering both clip_id and checkpoint_id paths', () => {
    const sessions: SessionLike[] = [
      { clip_id: 'a', date: new Date(NOW.getTime() - 86_400_000).toISOString(), overall_score: 80 },
      { checkpoint_id: 'legacy', date: new Date(NOW.getTime() - 2 * 86_400_000).toISOString(), overall_score: 80 },
    ]
    const w = weeklyStats(sessions, ['a', 'legacy'], NOW)
    expect(w.practicedClipIds.sort()).toEqual(['a', 'legacy'])
  })

  it('reports the most-recent session timestamp across the full history', () => {
    const sessions = [
      s('a', 10, 80), // before the week, but should still be lastSessionAt if nothing newer
    ]
    const w = weeklyStats(sessions, ['a'], NOW)
    expect(w.lastSessionAt).not.toBeNull()
    expect(w.sessionsCount).toBe(0)
  })

  it('returns nulls/empties cleanly when there is no history', () => {
    const w = weeklyStats([], ['a', 'b'], NOW)
    expect(w.sessionsCount).toBe(0)
    expect(w.improvedClipIds).toEqual([])
    expect(w.stagnantClipIds).toEqual([])
    expect(w.practicedClipIds).toEqual([])
    expect(w.lastSessionAt).toBeNull()
  })
})

describe('clipScoreSummary', () => {
  it('returns nulls when there are no sessions', () => {
    const r = clipScoreSummary([], 'a')
    expect(r).toEqual({ sessionCount: 0, lastScore: null, lastDate: null })
  })

  it('returns the most recent score + date and the total count', () => {
    const sessions = [s('a', 5, 60), s('a', 1, 80), s('a', 3, 70)]
    const r = clipScoreSummary(sessions, 'a')
    expect(r.sessionCount).toBe(3)
    expect(r.lastScore).toBe(80) // the daysAgo=1 entry
    expect(r.lastDate?.getTime()).toBeCloseTo(
      new Date(NOW.getTime() - 1 * 86_400_000).getTime(),
      -3, // within 1 ms
    )
  })
})
