/**
 * WGS-84 → GCJ-02 coordinate transformation.
 * GCJ-02 (火星坐标系) is used by Amap (高德) and other Chinese map providers.
 * GeoJSON data is in WGS-84, so when rendering over Amap tiles the coordinates
 * must be converted to avoid the ~100–700 m offset.
 */

const A = 6378245.0
const EE = 0.00669342162296594323

function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(x: number, y: number): number {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  r += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3
  r += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3
  return r
}

function transformLng(x: number, y: number): number {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  r += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3
  r += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3
  return r
}

/** Convert a single [lng, lat] pair from WGS-84 to GCJ-02. */
export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat]
  let dlat = transformLat(lng - 105, lat - 35)
  let dlng = transformLng(lng - 105, lat - 35)
  const radlat = (lat / 180) * Math.PI
  let magic = Math.sin(radlat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dlat = (dlat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI)
  dlng = (dlng * 180) / ((A / sqrtMagic) * Math.cos(radlat) * Math.PI)
  return [lng + dlng, lat + dlat]
}

function transformPositions(coords: unknown): unknown {
  if (!Array.isArray(coords)) return coords
  if (typeof coords[0] === 'number') {
    const [lng, lat, ...rest] = coords as number[]
    const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat)
    return rest.length > 0 ? [gcjLng, gcjLat, ...rest] : [gcjLng, gcjLat]
  }
  return coords.map(transformPositions)
}

/** Return a new FeatureCollection with all coordinates converted from WGS-84 to GCJ-02. */
export function convertToGcj02(
  geojson: GeoJSON.FeatureCollection
): GeoJSON.FeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map((f) => {
      if (!f.geometry || !('coordinates' in f.geometry)) return f
      return {
        ...f,
        geometry: {
          ...f.geometry,
          coordinates: transformPositions(
            (f.geometry as GeoJSON.Geometry & { coordinates: unknown }).coordinates
          ),
        } as GeoJSON.Geometry,
      }
    }),
  }
}
