import type { ReactElement, ReactNode } from 'react'
import { Button, Icon, type IconName } from '@blueprintjs/core'

interface Props {
  title: string
  icon: IconName
  onClose: () => void
  width?: number
  /** 置于同位置面板之上（如符号化面板叠在地图面板之上）。 */
  front?: boolean
  /** 标题右侧的状态标记（如"运行中"圆点）。 */
  badge?: ReactNode
  children: ReactNode
}

/**
 * 地图上的浮动面板外壳：统一位置、圆角、阴影、标题栏与关闭按钮。
 * 之前每个面板各自复制一份容器样式，宽度/z-index 已经出现漂移。
 */
export default function FloatingPanel({
  title,
  icon,
  onClose,
  width = 320,
  front = false,
  badge,
  children
}: Props): ReactElement {
  return (
    <div className={front ? 'yutu-panel yutu-panel--front' : 'yutu-panel'} style={{ width }}>
      <div className="yutu-panel-header">
        <div className="yutu-panel-title">
          <Icon icon={icon} size={14} color="var(--color-text-tertiary)" />
          <span>{title}</span>
          {badge}
        </div>
        <Button size="small" variant="minimal" icon="cross" onClick={onClose} />
      </div>
      <div className="yutu-panel-body">{children}</div>
    </div>
  )
}
