import { useId } from 'react'

/** Seven soft lobes in a 24-unit box, a little wider than tall: a puffy cloud. */
const LOBES = 7
const CLOUD = (() => {
  const reach = 8
  const bulge = 4.4
  const points = Array.from({ length: LOBES }, (_, index) => {
    const angle = (index / LOBES) * Math.PI * 2 - Math.PI / 2
    return [12 + reach * Math.cos(angle), 12.4 + reach * 0.9 * Math.sin(angle)] as const
  })
  const round = (value: number) => Math.round(value * 100) / 100
  return (
    `M${round(points[0]![0])} ${round(points[0]![1])}` +
    points
      .map((_, index) => {
        const [x, y] = points[(index + 1) % LOBES]!
        return `A${bulge} ${bulge} 0 0 1 ${round(x)} ${round(y)}`
      })
      .join('') +
    'Z'
  )
})()

/**
 * The assistant's mark: a small, puffy cloud with two dot eyes, lit from the
 * top left. Decorative; whatever it sits in names the assistant.
 */
export function AssistantMark({ className, size = 22 }: { className?: string; size?: number }) {
  const id = useId()
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <defs>
        <radialGradient cx="40%" cy="32%" id={`${id}-body`} r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f4f4f8" />
          <stop offset="100%" stopColor="#cfd0de" />
        </radialGradient>
        <filter height="150%" id={`${id}-lift`} width="140%" x="-20%" y="-20%">
          <feDropShadow
            dx="0"
            dy="0.7"
            floodColor="#14142b"
            floodOpacity="0.3"
            stdDeviation="0.7"
          />
        </filter>
      </defs>
      <path
        d={CLOUD}
        fill={`url(#${id}-body)`}
        filter={`url(#${id}-lift)`}
        stroke="#c4c5d4"
        strokeWidth="0.45"
      />
      <ellipse cx="9.4" cy="12.6" fill="#111111" rx="1.35" ry="1.85" />
      <ellipse cx="14.6" cy="12.6" fill="#111111" rx="1.35" ry="1.85" />
      <circle cx="9.8" cy="11.9" fill="#ffffff" opacity="0.9" r="0.45" />
      <circle cx="15" cy="11.9" fill="#ffffff" opacity="0.9" r="0.45" />
    </svg>
  )
}
