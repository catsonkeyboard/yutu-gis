import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  ControlGroup,
  Icon,
  InputGroup,
  Intent,
  Popover,
  Tooltip,
  Classes,
} from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { useBookmarkStore, MAX_BOOKMARKS } from '../../stores/bookmarkStore'
import { message } from '../../utils/toaster'

export default function BookmarkDropdown(): ReactElement {
  const { t } = useTranslation()
  const { bookmarks, add, remove, jumpTo } = useBookmarkStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const handleAdd = () => {
    const bookmark = add(name)
    if (!bookmark) {
      message.warning(t('bookmark.limit', { max: MAX_BOOKMARKS }))
      return
    }
    setName('')
    message.success(t('bookmark.added', { name: bookmark.name }))
  }

  const content = (
    <div style={{ width: 280, padding: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t('bookmark.title')}</div>
      <ControlGroup fill style={{ marginBottom: 8 }}>
        <InputGroup
          small
          placeholder={t('bookmark.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
        />
        <Button
          small
          intent={Intent.PRIMARY}
          text={t('bookmark.save')}
          onClick={handleAdd}
        />
      </ControlGroup>
      {bookmarks.length === 0 ? (
        <div
          className={Classes.TEXT_MUTED}
          style={{ fontSize: 12, textAlign: 'center', padding: '16px 0' }}
        >
          {t('bookmark.empty')}
        </div>
      ) : (
        <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bookmarks.map((b) => (
            <div
              key={b.id}
              onClick={() => {
                jumpTo(b.id)
                setOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 6px',
                borderRadius: 3,
                cursor: 'pointer',
              }}
              className="bp6-menu-item"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Icon icon="map-marker" intent={Intent.PRIMARY} size={14} style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {b.name}
                  </div>
                  <div className={Classes.TEXT_MUTED} style={{ fontSize: 10 }}>
                    z{b.zoom.toFixed(1)} · {b.center[0].toFixed(3)}, {b.center[1].toFixed(3)}
                  </div>
                </div>
              </div>
              <Button
                variant="minimal"
                size="small"
                intent={Intent.DANGER}
                icon="trash"
                onClick={(e) => {
                  e.stopPropagation()
                  remove(b.id)
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <Popover
      content={content}
      isOpen={open}
      onInteraction={(nextOpen) => setOpen(nextOpen)}
      placement="bottom-start"
    >
      <Tooltip content={t('bookmark.title')} placement="bottom">
        <Button
          icon="star"
          variant="minimal"
          size="small"
          intent={open ? Intent.PRIMARY : undefined}
          active={open}
        />
      </Tooltip>
    </Popover>
  )
}
