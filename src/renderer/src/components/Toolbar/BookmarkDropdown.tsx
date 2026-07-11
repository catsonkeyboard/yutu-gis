import { useState } from 'react'
import type { ReactElement } from 'react'
import { Button, Empty, Input, List, Popover, Space, Tooltip, Typography, message } from 'antd'
import { DeleteOutlined, EnvironmentOutlined, StarOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useBookmarkStore, MAX_BOOKMARKS } from '../../stores/bookmarkStore'

const { Text } = Typography

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
    <div style={{ width: 280 }}>
      <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
        <Input
          size="small"
          placeholder={t('bookmark.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPressEnter={handleAdd}
        />
        <Button size="small" type="primary" onClick={handleAdd}>
          {t('bookmark.save')}
        </Button>
      </Space.Compact>
      {bookmarks.length === 0 ? (
        <Empty description={t('bookmark.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={bookmarks}
          style={{ maxHeight: 260, overflowY: 'auto' }}
          renderItem={(b) => (
            <List.Item
              style={{ padding: '4px 4px', cursor: 'pointer' }}
              onClick={() => {
                jumpTo(b.id)
                setOpen(false)
              }}
              actions={[
                <Button
                  key="del"
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(b.id)
                  }}
                />,
              ]}
            >
              <Space size={6} style={{ minWidth: 0 }}>
                <EnvironmentOutlined style={{ color: '#1a6fb5', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <Text style={{ fontSize: 12 }} ellipsis>
                    {b.name}
                  </Text>
                  <div style={{ fontSize: 10, color: '#8f959e' }}>
                    z{b.zoom.toFixed(1)} · {b.center[0].toFixed(3)}, {b.center[1].toFixed(3)}
                  </div>
                </div>
              </Space>
            </List.Item>
          )}
        />
      )}
    </div>
  )

  return (
    <Popover
      content={content}
      title={t('bookmark.title')}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
    >
      <Tooltip title={t('bookmark.title')}>
        <Button icon={<StarOutlined />} type={open ? 'primary' : 'text'} size="small" />
      </Tooltip>
    </Popover>
  )
}
