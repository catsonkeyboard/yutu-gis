import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('BasemapSwitcher layout', () => {
  it('has bottom position set above navigation zoom controls', () => {
    const filePath = path.resolve(__dirname, '../BasemapSwitcher.tsx')
    const content = fs.readFileSync(filePath, 'utf-8')

    // Find the bottom property in the style object
    const match = content.match(/bottom:\s*(\d+)/)
    expect(match).not.toBeNull()

    const bottomValue = parseInt(match![1], 10)
    // MapLibre NavigationControl and AttributionControl occupy up to ~120px at bottom-right.
    // BasemapSwitcher must have bottom >= 120px to avoid overlapping with zoom in/out buttons.
    expect(bottomValue).toBeGreaterThanOrEqual(120)
  })
})
