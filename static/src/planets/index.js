// src/planets/index.js
// 星球聚合清单 —— 装配器(main.js)只 import 本文件,不直接 import 具体星球
// 团队协作规则:每人只改自己的 planetX.js + 在下方加 2 行(import + 数组项)
//              严禁修改 main.js;两人同时改本文件时,后合并者只加自己的行
//
// 成员交付步骤:
//   1. 把你的 planetX.js 放进 src/planets/
//   2. 在下方取消对应注释(或仿写两行)
//   3. 本地起服务器打开 galaxy.html,控制台无 [PlanetSpec] 报错即对接成功

import { coreSpec } from './core.js?v=20260902v3';
import { planet1Spec } from './planet1.js?v=20260902v4'; // 成员 B(黑洞行星)
import { betelgeuseSpec } from './planet_betelgeuse.js?v=20260905v5'; // 参宿四 · 红超巨星
import { saturnSpec } from './planet_saturn.js?v=20260906v3'; // 土星
import { crabSpec } from './planet_crab.js?v=20260906v3'; // 蟹状星云
import { rosetteSpec } from './planet_rosette.js?v=20260906v3'; // 玫瑰星云
import { carinaSpec } from './planet_carina.js?v=20260906v3'; // 船底座星云
import { velaSpec } from './planet_vela.js?v=20260906v3'; // 船帆座星云
import { tarantulaSpec } from './planet_tarantula.js?v=20260906v3'; // 蜘蛛星云
import { orionSpec } from './planet_orion.js?v=20260906v3'; // 猎户星云
import { helixSpec } from './planet_helix.js?v=20260906v3'; // 螺旋星云
import { phoenixASpec } from './planet_phoenixA.js?v=20260906v3'; // 凤凰座 A 星

// DEBUG: 确认 spec 成功导入
console.log('[planets/index] 已加载星球数量:', 12);

// 最终装配清单(顺序 = 装配顺序)
// 紧凑共享环布局:行星+星云同环 180° 错相(phase),同环 speed 一致 → 永不错位相撞
// 最外轨道 5650 → 3200,相机拉满(maxDistance 6500)即可一眼看全
export const PLANET_SPECS = [
    coreSpec,           // 中心恒星 (orbit=0)
    planet1Spec,        // GARGANTUA 黑洞 (orbit=550)
    betelgeuseSpec,     // 参宿四 (orbit=1150)
    saturnSpec,         // 土星 (环1 orbit=1550, 相位0°)
    crabSpec,           // 蟹状星云 (环1 orbit=1550, 相位180°)
    rosetteSpec,        // 玫瑰星云 (环2 orbit=1950, 相位0°)
    carinaSpec,         // 船底座星云 (环2 orbit=1950, 相位180°)
    velaSpec,           // 船帆座星云 (环3 orbit=2350, 相位0°)
    tarantulaSpec,      // 蜘蛛星云 (环3 orbit=2350, 相位180°)
    orionSpec,          // 猎户星云 (环4 orbit=2800, 相位0°)
    helixSpec,          // 螺旋星云 (环4 orbit=2800, 相位180°)
    phoenixASpec,       // 凤凰座 A 星 (最外环 orbit=3200)
];
