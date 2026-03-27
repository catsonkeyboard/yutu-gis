import type { StyleSpecification } from 'maplibre-gl'

export type MapProvider =
  | 'osm'
  | 'google-street'
  | 'google-satellite'
  | 'amap-street'
  | 'amap-satellite'
  | 'amap-terrain'

export interface ApiKeys {
  google: string
  amap: string
}

export function getTileStyle(provider: MapProvider, apiKeys: ApiKeys): StyleSpecification {
  const styles: Record<MapProvider, StyleSpecification> = {
    osm: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
    'google-street': {
      version: 8,
      sources: {
        google: {
          type: 'raster',
          tiles: [
            `https://mt0.google.com/vt/lyrs=m&hl=zh-CN&x={x}&y={y}&z={z}${apiKeys.google ? `&key=${apiKeys.google}` : ''}`,
          ],
          tileSize: 256,
          attribution: '© Google',
        },
      },
      layers: [{ id: 'google', type: 'raster', source: 'google' }],
    },
    'google-satellite': {
      version: 8,
      sources: {
        google: {
          type: 'raster',
          tiles: [
            `https://mt0.google.com/vt/lyrs=s&hl=zh-CN&x={x}&y={y}&z={z}${apiKeys.google ? `&key=${apiKeys.google}` : ''}`,
          ],
          tileSize: 256,
          attribution: '© Google',
        },
      },
      layers: [{ id: 'google', type: 'raster', source: 'google' }],
    },
    'amap-street': {
      version: 8,
      sources: {
        amap: {
          type: 'raster',
          tiles: [
            'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
          ],
          tileSize: 256,
          attribution: '© 高德地图',
        },
      },
      layers: [{ id: 'amap', type: 'raster', source: 'amap' }],
    },
    'amap-satellite': {
      version: 8,
      sources: {
        amap: {
          type: 'raster',
          tiles: ['https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}'],
          tileSize: 256,
          attribution: '© 高德地图',
        },
      },
      layers: [{ id: 'amap', type: 'raster', source: 'amap' }],
    },
    'amap-terrain': {
      version: 8,
      sources: {
        amap: {
          type: 'raster',
          tiles: ['https://webst01.is.autonavi.com/appmaptile?style=7&x={x}&y={y}&z={z}'],
          tileSize: 256,
          attribution: '© 高德地图',
        },
      },
      layers: [{ id: 'amap', type: 'raster', source: 'amap' }],
    },
  }
  return styles[provider]
}
