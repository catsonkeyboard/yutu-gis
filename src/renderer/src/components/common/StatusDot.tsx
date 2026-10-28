import type { ReactElement } from 'react'

export default function StatusDot({
  size = 6,
  color = 'var(--color-success)',
  title
}: {
  size?: number
  color?: string
  title?: string
}): ReactElement {
  return (
    <span
      title={title}
      style={{
        position: 'absolute',
        top: 2,
        right: 2,
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: '0 0 0 2px var(--color-bg-panel)',
        pointerEvents: 'none'
      }}
    />
  )
}
