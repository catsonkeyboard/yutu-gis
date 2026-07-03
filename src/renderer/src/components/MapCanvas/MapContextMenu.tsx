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
        background: '#fff',
        border: '1px solid #e8e8e8',
        borderRadius: 6,
        boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
        zIndex: 1000,
        minWidth: menuWidth,
        padding: '4px 0',
        userSelect: 'none',
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: 13,
            color: '#333',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = '#f5f5f5')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
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
