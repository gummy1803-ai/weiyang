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
import { saturnSpec } from './planet_saturn.js?v=20260906v1'; // 土星
import { crabSpec } from './planet_crab.js?v=20260906v1'; // 蟹状星云
import { rosetteSpec } from './planet_rosette.js?v=20260906v1'; // 玫瑰星云
import { carinaSpec } from './planet_carina.js?v=20260906v1'; // 船底座星云
import { velaSpec } from './planet_vela.js?v=20260906v1'; // 船帆座星云
import { tarantulaSpec } from './planet_tarantula.js?v=20260906v2'; // 蜘蛛星云
import { orionSpec } from './planet_orion.js?v=20260906v2'; // 猎户星云
import { helixSpec } from './planet_helix.js?v=20260906v1'; // 螺旋星云
import { phoenixASpec } from './planet_phoenixA.js?v=20260906v1'; // 凤凰座 A 星

// DEBUG: 确认 spec 成功导入
console.log('[planets/index] 已加载星球数量:', 12);

// 最终装配清单(顺序 = 装配顺序)
export const PLANET_SPECS = [
    coreSpec,           // 中心恒星 (orbit=0)
    planet1Spec,        // GARGANTUA 黑洞 (orbit=550)
    betelgeuseSpec,     // 参宿四 (orbit=1150)
    saturnSpec,         // 土星 (orbit=1650)
    crabSpec,           // 蟹状星云 (orbit=2150)
    rosetteSpec,        // 玫瑰星云 (orbit=2650)
    carinaSpec,         // 船底座星云 (orbit=3150)
    velaSpec,           // 船帆座星云 (orbit=3650)
    tarantulaSpec,      // 蜘蛛星云 (orbit=4150)
    orionSpec,          // 猎户星云 (orbit=4650)
    helixSpec,          // 螺旋星云 (orbit=5150)
    phoenixASpec,       // 凤凰座 A 星 (orbit=5650)
];
