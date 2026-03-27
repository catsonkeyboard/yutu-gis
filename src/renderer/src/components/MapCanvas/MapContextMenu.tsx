// src/renderer/src/components/MapCanvas/MapContextMenu.tsx
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export interface ContextMenuPos {
  x: number
  y: number
  lngLat: [number, number]
}

interface Props {
  pos: ContextMenuPos | null
  onExtract: (lngLat: [number, number]) => void
  onClose: () => void
}

export default function MapContextMenu({ pos, onExtract, onClose }: Props) {
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

  // Keep menu within viewport
  const menuWidth = 180
  const menuHeight = 40
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
      <div
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
          onExtract(pos.lngLat)
        }}
      >
        {t('osm.menuItem')}
      </div>
    </div>
  )
}
