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

// DEBUG: 确认 planet1Spec 成功导入
console.log('[planets/index] coreSpec.name =', coreSpec.name);
console.log('[planets/index] planet1Spec.name =', planet1Spec.name);

// 成员星球交付后取消注释:
// import { starSpec } from './star.js';        // 成员 A(主星,若主星另行美化)
// import { planet2Spec } from './planet2.js'; // 成员 C
// import { planet3Spec } from './planet3.js'; // 成员 D
// import { planet4Spec } from './planet4.js'; // 成员 E

// 最终装配清单(顺序 = 装配顺序)
export const PLANET_SPECS = [
    coreSpec,
    planet1Spec,
    // starSpec,
    // planet2Spec,
    // planet3Spec,
    // planet4Spec,
];
