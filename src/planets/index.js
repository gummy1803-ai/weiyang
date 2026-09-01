// src/planets/index.js
// 星球聚合模块 —— main.js 从此文件 import 全部 specs
// 团队协作规则:每人只改自己的 planet 文件 + 在此文件加一行 export
//              严禁修改 main.js 的装配逻辑
//
// 使用步骤:
//   1. 你写完自己的 planetX.js 后,在这里加一行:
//        export { yourSpecName as planetXSpec } from './planetX.js';
//   2. 不要改 main.js
//   3. 冲突处理:若两人同时改此文件,后合并者只加自己那行,不删别人的

import { templateSpec } from './template.js';

// Day 1:只有 template,成员交付后取消注释并补充 import
// import { starSpec } from './star.js';        // 成员 A
// import { planet1Spec } from './planet1.js'; // 成员 B
// import { planet2Spec } from './planet2.js'; // 成员 C
// import { planet3Spec } from './planet3.js'; // 成员 D
// import { planet4Spec } from './planet4.js'; // 成员 E

// 最终导出的装配清单,main.js 遍历这个数组
export const PLANET_SPECS = [
    templateSpec,
    // starSpec,
    // planet1Spec,
    // planet2Spec,
    // planet3Spec,
    // planet4Spec,
];
