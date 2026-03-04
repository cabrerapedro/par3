'use client'

interface DataPoint {
  date: string
  score: number
  label?: string
}

interface Props {
  data: DataPoint[]
  height?: number
}

export function ProgressChart({ data, height = 160 }: Props) {
  if (!data.length) return null

  const W = 400
  const H = height
  const PAD = { top: 12, right: 16, bottom: 28, left: 36 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const scores = data.map(d => d.score)
  const minScore = 0
  const maxScore = 100

  const toX = (i: number) =>
    PAD.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW)
  const toY = (score: number) =>
    PAD.top + chartH - ((score - minScore) / (maxScore - minScore)) * chartH

  const points = data.map((d, i) => ({ ...d, x: toX(i), y: toY(d.score) }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${(PAD.top + chartH).toFixed(1)} L${points[0].x},${(PAD.top + chartH).toFixed(1)} Z`

  const lastScore = scores[scores.length - 1]
  const lineColor = lastScore >= 80 ? '#34d178' : lastScore >= 50 ? '#e8b930' : '#f04848'

  const trend = data.length >= 2 ? scores[scores.length - 1] - scores[0] : 0

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getDate()}/${d.getMonth() + 1}`
  }

  // Y-axis reference lines
  const refs = [80, 50]

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={`grad-${lastScore}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Reference lines + labels */}
        {refs.map(ref => (
          <g key={ref}>
            <line
              x1={PAD.left} y1={toY(ref)} x2={PAD.left + chartW} y2={toY(ref)}
              stroke={ref === 80 ? '#34d178' : '#e8b930'}
              strokeWidth="0.8" strokeDasharray="4,4" opacity="0.35"
            />
            <text
              x={PAD.left - 4} y={toY(ref) + 4}
              textAnchor="end" fontSize="9" fill={ref === 80 ? '#34d178' : '#e8b930'} opacity="0.7"
            >
              {ref}%
            </text>
          </g>
        ))}

        {/* Area */}
        <path d={areaPath} fill={`url(#grad-${lastScore})`} />

        {/* Line */}
        <path
          d={linePath}
          stroke={lineColor} strokeWidth="2.5" fill="none"
          strokeLinecap="round" strokeLinejoin="round"
        />

        {/* Dots + score labels */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill={lineColor} />
            <circle cx={p.x} cy={p.y} r="2" fill="var(--color-background)" />
            {/* Score label on hover-ish: show for first, last, and peaks */}
            {(i === 0 || i === points.length - 1) && (
              <text
                x={p.x}
                y={p.y - 8}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={lineColor}
              >
                {p.score}%
              </text>
            )}
          </g>
        ))}

        {/* X-axis date labels */}
        {points.map((p, i) => {
          // Show at most 5 labels, always first and last
          const total = points.length
          const step = Math.max(1, Math.floor(total / 4))
          if (i !== 0 && i !== total - 1 && i % step !== 0) return null
          return (
            <text
              key={i}
              x={p.x}
              y={H - 4}
              textAnchor="middle"
              fontSize="9"
              fill="var(--color-muted-foreground)"
            >
              {formatDate(p.date)}
            </text>
          )
        })}
      </svg>

      {/* Trend pill */}
      {data.length >= 2 && (
        <div className="flex items-center justify-end gap-1.5 mt-1">
          <span className={`text-xs font-semibold ${
            trend > 5 ? 'text-ok' : trend < -5 ? 'text-bad' : 'text-muted'
          }`}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {trend > 0 ? '+' : ''}{trend}% total
          </span>
          <span className="text-muted-foreground text-xs">({data.length} sesiones)</span>
        </div>
      )}
    </div>
  )
}
