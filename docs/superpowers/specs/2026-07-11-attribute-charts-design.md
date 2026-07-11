# 属性图表设计

日期：2026-07-11 · 优先级 P1 · 参考 GeoLibre "Charts panel (histogram, bar…)"

## 目标

在属性表面板（P0-1）内增加"图表"页签：对选中图层的字段快速出直方图/柱状图/
饼图，辅助分析字段分布。依赖属性表的列推导与 numeric 判定（复用 tableUtils）。

## 范围（YAGNI 裁剪）

- 三种图：**直方图**（numeric 字段，等宽分箱）、**柱状图**（分类字段
  top-20 频次）、**饼图**（分类字段 top-10 占比 + 其它）。
- 不做散点/折线/箱线（GeoLibre 有，但需要双字段/时序语义，需求不明确）。
- **手写 SVG 渲染，不引图表依赖**（总览·约定）。数据量在千级 bar 以内，无性能问题。

## UI

- 属性表面板头部左侧加 Tabs：`表格` / `图表`（图表页签沿用面板高度）。
- 图表页签工具行：图表类型 Radio + 字段 Select（直方图仅列 numeric 字段；
  柱状/饼列全部字段）+ 直方图分箱数 InputNumber(5–50, 默认 20)。
- 图表区：SVG 自适应面板宽度；hover bar/扇区显示 tooltip（title 元素即可）；
  下方显示样本数/空值数。
- 数据基于**过滤后的行集**（与表格页签一致，过滤条件共享）。

## 实现

- `components/AttributeTable/ChartsTab.tsx` + 纯函数
  `chartUtils.ts`：`histogramBins(values, n)`、`topCounts(values, n)`。
- SVG：横轴标签旋转 45° 截断；颜色用单色（#1a6fb5）+ 饼图循环取 styling 的色带。

## 测试

vitest：分箱边界（含全相同值、单值）、topCounts 排序与"其它"归并。
