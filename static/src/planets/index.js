// src/planets/index.js
// 星球聚合清单 —— 装配器(main.js)只 import 本文件,不直接 import 具体星球
// 团队协作规则:每人只改自己的 planetX.js + 在下方加 2 行(import + 数组项)
//              严禁修改 main.js;两人同时改本文件时,后合并者只加自己的行
//
// 成员交付步骤:
//   1. 把你的 planetX.js 放进 src/planets/
//   2. 在下方取消对应注释(或仿写两行)
//   3. 本地起服务器打开 galaxy.html,控制台无 [PlanetSpec] 报错即对接成功

import { coreSpec } from './core.js?v=20260906v7';
import { planet1Spec } from './planet1.js?v=20260906v7'; // GARGANTUA 黑洞
import { betelgeuseSpec } from './planet_betelgeuse.js?v=20260906v7'; // 参宿四
import { saturnSpec } from './planet_saturn.js?v=20260906v7'; // 土星
import { crabSpec } from './planet_crab.js?v=20260906v7'; // 蟹状星云
import { rosetteSpec } from './planet_rosette.js?v=20260906v7'; // 玫瑰星云
import { carinaSpec } from './planet_carina.js?v=20260906v7'; // 船底座星云
import { velaSpec } from './planet_vela.js?v=20260906v7'; // 船帆座星云
import { tarantulaSpec } from './planet_tarantula.js?v=20260906v7'; // 蜘蛛星云
import { orionSpec } from './planet_orion.js?v=20260906v7'; // 猎户星云
import { helixSpec } from './planet_helix.js?v=20260906v7'; // 螺旋星云
import { phoenixASpec } from './planet_phoenixA.js?v=20260906v7'; // 凤凰座 A 星

// DEBUG: 确认 spec 成功导入
console.log('[planets/index] 已加载星球数量:', 12);

// 最终装配清单(顺序 = 装配顺序)
// GARGANTUA 置于最外环(3200)作为系统边界天体;其余 10 颗补位 550~2500 五环
// 速度按开普勒递减(内快外慢):环1 0.0020 → 环5 0.0005 → GARGANTUA 0.0003
// 同环 180° 错相 + 各环基础相位环绕分布,避免直线排列
export const PLANET_SPECS = [
    coreSpec,           // 中心恒星 (orbit=0, scale 2.0x)
    betelgeuseSpec,     // 参宿四 (环1 orbit=550, 45°)
    saturnSpec,         // 土星 (环1 orbit=550, 225°)
    crabSpec,           // 蟹状星云 (环2 orbit=1000, 60°)
    rosetteSpec,        // 玫瑰星云 (环2 orbit=1000, 240°)
    carinaSpec,         // 船底座星云 (环3 orbit=1500, 120°)
    velaSpec,           // 船帆座星云 (环3 orbit=1500, 300°)
    tarantulaSpec,      // 蜘蛛星云 (环4 orbit=2000, 30°)
    orionSpec,          // 猎户星云 (环4 orbit=2000, 210°)
    helixSpec,          // 螺旋星云 (环5 orbit=2500, 90°)
    phoenixASpec,       // 凤凰座 A 星 (环5 orbit=2500, 270°)
    planet1Spec,        // GARGANTUA (最外环 orbit=3200, 90°) — 系统边界天体
];
