import maplibregl from 'maplibre-gl'

/**
 * MapboxDraw 自定义样式（MapLibre layer spec 数组，source 由 MapboxDraw 内部注入）。
 *
 * 默认主题（node_modules/@mapbox/mapbox-gl-draw/src/lib/theme.js）画的要素非常淡：
 * 填充 opacity 仅 0.1、线宽 2，且绘制中（active）的线还套了 `line-dasharray: [0.2, 2]`
 * 的极稀疏虚线，配低饱和青色 #3bb2d0 —— 深色底图下基本看不清。
 * 这里改为实线 + 更粗线宽 + 更高不透明度，主体色沿用选中态橙色 #ff7700，顶点/中点
 * 保留白色描边，浅色与深色底图下都清晰可见。
 */
const DRAW_COLOR = '#ff7700'
const DRAW_COLOR_ACTIVE = '#ffb04d'

const IS_ACTIVE: maplibregl.ExpressionSpecification = ['==', ['get', 'active'], 'true']
const IS_LINE_OR_POLYGON: maplibregl.ExpressionSpecification = ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']]
const IS_FEATURE_POINT: maplibregl.ExpressionSpecification = ['all', ['==', '$type', 'Point'], ['==', 'meta', 'feature']]
const IS_VERTEX: maplibregl.ExpressionSpecification = ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex'], ['!=', 'mode', 'simple_select']]

type DrawFillLayer = Omit<maplibregl.FillLayerSpecification, 'source'>
type DrawLineLayer = Omit<maplibregl.LineLayerSpecification, 'source'>
type DrawCircleLayer = Omit<maplibregl.CircleLayerSpecification, 'source'>

const polygonFill: DrawFillLayer = {
  id: 'gl-draw-polygon-fill',
  type: 'fill',
  filter: ['==', '$type', 'Polygon'],
  paint: {
    'fill-color': ['case', IS_ACTIVE, DRAW_COLOR_ACTIVE, DRAW_COLOR],
    'fill-opacity': ['case', IS_ACTIVE, 0.35, 0.25]
  }
}

const lines: DrawLineLayer = {
  id: 'gl-draw-lines',
  type: 'line',
  filter: IS_LINE_OR_POLYGON,
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': ['case', IS_ACTIVE, DRAW_COLOR_ACTIVE, DRAW_COLOR],
    'line-width': ['case', IS_ACTIVE, 4, 3]
  }
}

const pointOuter: DrawCircleLayer = {
  id: 'gl-draw-point-outer',
  type: 'circle',
  filter: IS_FEATURE_POINT,
  paint: {
    'circle-radius': ['case', IS_ACTIVE, 7, 5],
    'circle-color': '#ffffff'
  }
}

const pointInner: DrawCircleLayer = {
  id: 'gl-draw-point-inner',
  type: 'circle',
  filter: IS_FEATURE_POINT,
  paint: {
    'circle-radius': ['case', IS_ACTIVE, 5, 3],
    'circle-color': ['case', IS_ACTIVE, DRAW_COLOR_ACTIVE, DRAW_COLOR]
  }
}

const vertexOuter: DrawCircleLayer = {
  id: 'gl-draw-vertex-outer',
  type: 'circle',
  filter: IS_VERTEX,
  paint: {
    'circle-radius': ['case', IS_ACTIVE, 7, 5],
    'circle-color': '#ffffff'
  }
}

const vertexInner: DrawCircleLayer = {
  id: 'gl-draw-vertex-inner',
  type: 'circle',
  filter: IS_VERTEX,
  paint: {
    'circle-radius': ['case', IS_ACTIVE, 5, 3],
    'circle-color': DRAW_COLOR
  }
}

const midpoint: DrawCircleLayer = {
  id: 'gl-draw-midpoint',
  type: 'circle',
  filter: ['==', 'meta', 'midpoint'],
  paint: {
    'circle-radius': 4,
    'circle-color': DRAW_COLOR,
    'circle-stroke-width': 1.5,
    'circle-stroke-color': '#ffffff'
  }
}

export const drawStyles: object[] = [polygonFill, lines, pointOuter, pointInner, vertexOuter, vertexInner, midpoint]
