// src/renderer/src/components/MapCanvas/MapContextMenu.tsx
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export interface ContextMenuPos {
  x: number
  y: number
  bounds: [number, number, number, number] // [south, west, north, east]
}

interface Props {
  pos: ContextMenuPos | null
  onExtract: (bounds: [number, number, number, number]) => void
  onTilesDownload: (bounds: [number, number, number, number]) => void
  onClose: () => void
}

export default function MapContextMenu({ pos, onExtract, onTilesDownload, onClose }: Props) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pos) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [pos, onClose])

  if (!pos) return null

  const items = [
    { label: t('osm.menuItem'), action: onExtract },
    { label: t('tiles.menuItem'), action: onTilesDownload }
  ]

  const menuWidth = 180
  const menuHeight = 8 + items.length * 32
  const left = pos.x + menuWidth > window.innerWidth ? pos.x - menuWidth : pos.x
  const top = pos.y + menuHeight > window.innerHeight ? pos.y - menuHeight : pos.y

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left,
        top,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-strong)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 'var(--z-context-menu)',
        minWidth: menuWidth,
        padding: 4,
        userSelect: 'none',
        color: 'var(--color-text)',
        fontSize: 12,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="yutu-context-item"
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onClick={() => {
            onClose()
            item.action(pos.bounds)
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}
