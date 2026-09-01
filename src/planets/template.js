// src/planets/template.js
// 模板星球工厂 —— 成员参考实现
// 维护者:架构协调者
// ====================================================================
// 使用文档(给团队成员)
// ====================================================================
//
// 【这个文件是什么】
//   一个符合 PlanetSpec 契约的最简星球,包含本体 + 一个星环。
//   它能被 main.js 装配进场景,也是你做自己星球时的"抄改"样板。
//
// 【怎么基于它做你的星球】
//   1. 复制本文件,改名为 planet1.js / planet2.js / ... / star.js
//   2. 改 group.name、createTemplatePlanet 函数名、templateSpec 变量名
//      (全部统一改成你的星球名,如 planet1 / createPlanet1 / planet1Spec)
//   3. 改色板、粒子数、半径、星环参数、运动算法 —— 发挥创意
//   4. spec.orbit 用轨道分配表给你的值,不要自己编
//   5. 装配前自检:import { assertValidSpec } from '../PlanetSpec.js';
//                 assertValidSpec(yourSpec);
//
// 【关键约束(违反则校验失败,无法装配)】
//   - factory() 返回的 Group 必须以 (0,0,0) 为中心
//     轨道偏移由 main.js 的父 Group 处理,你不要自己位移
//   - 粒子数(particleBudget)≤ 8000,本体+星环合计
//   - 用共享纹理:import { particleTexture } from '../particleTexture.js'
//     禁止自己 new THREE.CanvasTexture
//   - coreRadius 在 [20,80] 内
//   - 星球本体的 PointsMaterial.color 用 spec.appearance.palette[0]
//     星环用 palette[1],保证色板与 spec 声明一致
//
// 【本地预览方法(不依赖 main.js)】
//   写一个临时 preview.html:
//   <script type="module">
//     import * as THREE from 'three';
//     import { createTemplatePlanet } from './src/planets/template.js';
//     // 起 scene/camera/renderer,把 createTemplatePlanet() 加进 scene
//   </script>
//   用本地服务器打开,确认能看到你的星球即可
//
// 【主星(A)额外约定】
//   - spec.appearance.supportsColorCustomization = true
//   - factory() 返回的 group.userData 须挂 setColor(primaryHex, secondaryHex) 方法
//   - 色斑效果:用顶点颜色(geometry.setAttribute('color', ...)) + PointsMaterial.vertexColors=true
//     颜色由噪声函数决定,改色时重算 vertex colors
// ====================================================================

import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js';
import { PlanetType } from '../PlanetSpec.js';

/**
 * 模板星球工厂函数
 * 返回一个 THREE.Group,内含星球本体 + 星环
 * @returns {THREE.Group}
 */
export function createTemplatePlanet() {
    const group = new THREE.Group();
    group.name = 'template';  // 必须与 spec.name 一致,便于 getObjectByName 检索

    // ---------- 星球本体 ----------
    const CORE_RADIUS = 50;
    const CORE_PARTICLES = 4000;

    const planetGeo = new THREE.BufferGeometry();
    const positions = [];

    // 球面均匀分布(极坐标随机),20% 内部填充增加体积感
    for (let i = 0; i < CORE_PARTICLES; i++) {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = Math.random() > 0.8 ? CORE_RADIUS * Math.random() : CORE_RADIUS;
        positions.push(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi)
        );
    }
    planetGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const planetMat = new THREE.PointsMaterial({
        color: 0xff6600,            // 恢复原始橙色,用 spec.appearance.palette[0]
        size: 3,
        map: particleTexture,       // 复用共享纹理单例
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const planetPoints = new THREE.Points(planetGeo, planetMat);
    planetPoints.name = 'template-core';
    group.add(planetPoints);

    // ---------- 星环(可选,数量/样式自由设计)----------
    const RING_INNER = 70;
    const RING_OUTER = 110;
    const RING_PARTICLES = 2000;

    const ringGeo = new THREE.BufferGeometry();
    const ringPos = [];
    for (let i = 0; i < RING_PARTICLES; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = THREE.MathUtils.lerp(RING_INNER, RING_OUTER, Math.random());
        ringPos.push(
            r * Math.cos(angle),
            (Math.random() - 0.5) * 2,  // 环厚度,极薄
            r * Math.sin(angle)
        );
    }
    ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPos, 3));

    const ringMat = new THREE.PointsMaterial({
        color: 0xffffff,            // 用 spec.appearance.palette[1]
        size: 2,
        map: particleTexture,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const ringPoints = new THREE.Points(ringGeo, ringMat);
    ringPoints.name = 'template-ring';
    ringPoints.rotation.x = Math.PI / 3;
    ringPoints.rotation.z = Math.PI / 6;
    group.add(ringPoints);

    return group;
}

/**
 * 模板星球的 PlanetSpec(符合契约)
 * 装配阶段:main.js 会遍历所有 spec,调 factory() 装进场景
 */
export const templateSpec = {
    name: 'template',
    type: PlanetType.PLANET,
    factory: createTemplatePlanet,
    orbit: {
        radius: 200,          // 轨道分配表给的值
        speed: 0.015,
        inclination: 0
    },
    appearance: {
        coreRadius: 50,
        particleBudget: 4000 + 2000,  // 本体 + 星环合计
        palette: [0xff6600, 0xffaa00] // [主色橙, 辅色亮橙] 恢复原始色调
    }
};
