import { useDrawStore } from '../../stores/drawStore'

const HINTS: Record<string, string> = {
  point: '点击地图添加点，按 Escape 取消',
  line: '点击添加节点，双击完成绘制，按 Escape 取消',
  polygon: '点击添加顶点，点击起点或双击完成围栏，按 Escape 取消',
}

interface Props {
  onSave?: () => void
}

export default function DrawHintBanner({ onSave }: Props) {
  const drawMode = useDrawStore((s) => s.drawMode)
  const features = useDrawStore((s) => s.features)
  if (drawMode === 'off') return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(22, 119, 255, 0.9)',
        color: '#fff',
        padding: '4px 12px',
        borderRadius: 4,
        fontSize: 13,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ pointerEvents: 'none' }}>{HINTS[drawMode]}</span>
      {features.length > 0 && (
        <button
          onClick={onSave}
          style={{
            background: 'rgba(255,255,255,0.25)',
            border: '1px solid rgba(255,255,255,0.6)',
            borderRadius: 3,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            padding: '1px 10px',
            lineHeight: '20px',
          }}
        >
          完成并保存
        </button>
      )}
    </div>
  )
}
