# 数据监控（Data Monitoring）设计

日期：2026-07-10

## 目标

工具栏新增“数据监控”下拉入口，可在地图上叠加多种实时监控数据：
气象（降水雷达 / 温度 / 云量 / 风场 / 气压）、地震分布、台风路径。
优先使用公共开放 API；需要 API Key 的源（OpenWeatherMap）在设置中配置。

## 数据源选择

| 数据 | 来源 | Key | 形式 |
|---|---|---|---|
| 降水雷达 | RainViewer `api.rainviewer.com/public/weather-maps.json` | 不需要 | raster 瓦片（最近一帧） |
| 温度/云量/风场/气压/降水 | OpenWeatherMap `tile.openweathermap.org/map/{layer}/{z}/{x}/{y}.png?appid=KEY` | 需要（免费注册） | raster 瓦片 |
| 地震 | USGS `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{feed}.geojson` | 不需要 | GeoJSON 点（近 24 小时） |
| 台风 | 温州台风网 `data.istrongcloud.com/v2/data/complex/{year}.json` + `{tfbh}.json` | 不需要 | 实况路径 + 预报路径（默认“中国”预报机构） |

### 第二批（2026-07-10 追加）

| 数据 | 来源 | Key | 形式 |
|---|---|---|---|
| 卫星影像（真彩/海温/夜光） | NASA GIBS WMTS `gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{time}/{matrixSet}/{z}/{y}/{x}` | 不需要 | raster 瓦片；每日图层用昨日 UTC 日期（truecolor 不支持 `default` 时间），Black Marble 用 `default` |
| 全球火点 | NASA FIRMS `api/area/csv/{KEY}/VIIRS_SNPP_NRT/world/1` | 需要（免费 MAP_KEY） | CSV→GeoJSON 点；剔除低置信度，按 FRP 截断 2 万条；key 错误以 HTTP-200 纯文本返回，需服务端识别 |
| 综合灾害警报 | GDACS `www.gdacs.org/xml/gdacs.geojson` | 不需要 | 仅取 Point 要素、按事件去重；源较慢（数 MB），超时放宽到 60 s |
| 空气质量 | WAQI `api.waqi.info/v2/map/bounds` | 需要（免费 token） | 按当前视口取站点，moveend 防抖 1.2 s 重取 |

已实测免 key 源均可直接访问；FIRMS/WAQI 验证了错误路径（无效 key 返回清晰报错）。

## 架构

```
Toolbar → MonitorDropdown (Popover 多选面板) → monitorStore (zustand, 运行时状态)
MapCanvas → MonitorLayer (仿 FlightLayer)
  raster 叠加: monitor-radar / monitor-owm-*  → 插在第一个 user-* 图层之下
  vector 叠加: monitor-quake-* / monitor-ty-* → bringMonitorLayersToTop() 置顶
  轮询: 地震 5 min，台风 / 雷达帧 10 min；styledata 后自动重建
数据经 Python 后端代理（httpx + 系统代理，同 WFS/OSM）:
  GET /monitor/earthquakes?feed=all_day  → USGS，属性瘦身 (mag/place/time/depth/url)
  GET /monitor/typhoons                  → 当年台风列表；活跃台风(is_current)优先，否则最近 1 个；
                                           输出 FeatureCollection: kind = track/point/forecast/forecast-point/label
  GET /monitor/rainviewer                → 最新雷达帧的瓦片 URL 模板
OWM 瓦片 URL 由前端直接拼接（浏览器直接加载瓦片图片，CSP 已允许 https img-src）。
```

## 关键决策

- **后端代理矢量数据**：与 WFS/Overpass 一致，兼容 SOCKS 代理环境；瓦片图片仍由 MapLibre 直接加载。
- **图层顺序**：气象 raster 半透明叠加在底图之上、用户数据之下；地震/台风矢量永远置顶（renderLayers 里与 flight/vehicle 一起 bring-to-top）。
- **GCJ-02**：高德底图时地震/台风矢量数据经 convertToGcj02 转换；气象 raster 瓦片为标准 WGS-84 网格，在高德底图上存在固有偏移（与离线瓦片同样的既有 caveat）。
- **OWM Key**：存 `~/.yutugis/config.json` 的 `openWeather.apiKey`（新增字段，loadConfig 自动向后兼容）；未配置时点击相应图层提示去设置。
- **台风样式**：实况路径实线 + 按强度分色的路径点（TD 绿 → SuperTY 红），预报路径虚线 + 空心点，台风名标注在最新位置；点击点位弹出详情（强度/风速/气压/时间）。
- **地震样式**：圆点半径与颜色随震级（M<3 绿 → M≥6 红），点击弹出震级/位置/深度/时间。
