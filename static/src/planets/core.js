// src/planets/core.js
// 核心星球(主星) —— 原始 index.html 星球的 1:1 复刻模块
// 维护者:架构协调者
// ====================================================================
// 【重要】本文件是对原始 index.html 星球代码的逐字节复刻:
//   - 颜色 0xff6600 / 白环、粒子数 8000/4000/4000、R=50、80%表面+20%内部
//   - 星环半径 70-110 / 80-140、倾角与原版一致
//   - 动画(自转 0.1、双环差速 -0.002/+0.003)与原版一致
// 任何情况下不允许"优化"或"改进"这里的视觉参数 —— 美感以原版为基准
// ====================================================================

import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js';
import { PlanetType } from '../PlanetSpec.js';

// 与原始 index.html 的 CONFIG 完全一致
const CORE_CONFIG = {
    planetColor: 0xff6600,   // 绚烂橙色
    ringColor: 0xffffff,     // 白色
    particleCount: 8000,
    ringParticleCount: 4000
};

/**
 * 核心星球工厂 —— 返回 Group(星球本体 + 双星环)
 * 返回值以 (0,0,0) 为中心,轨道偏移由装配器(main.js)处理
 * @returns {THREE.Group}
 */
export function createCorePlanet() {
    const group = new THREE.Group();
    group.name = 'core';
    group.scale.setScalar(2.0);  // 体积 = 原始 2 倍(用户要求);本体 R=100、双环到 280

    // ---------- 星球本体(原版 202-240 行,逐行对应) ----------
    const planetGeo = new THREE.BufferGeometry();
    const planetPos = [];
    const planetSizes = [];

    // 生成球体表面的密集粒子
    for (let i = 0; i < CORE_CONFIG.particleCount; i++) {
        // 极坐标随机分布，但在半径上聚集
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);

        // 半径分布：主要在表面(R=50)，少量在内部填充
        let r = 50;
        if (Math.random() > 0.8) r = 50 * Math.random(); // 20% 内部填充

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        planetPos.push(x, y, z);
        planetSizes.push(Math.random() * 2 + 1); // 大小随机
    }

    planetGeo.setAttribute('position', new THREE.Float32BufferAttribute(planetPos, 3));
    planetGeo.setAttribute('size', new THREE.Float32BufferAttribute(planetSizes, 1));

    const planetMat = new THREE.PointsMaterial({
        color: CORE_CONFIG.planetColor,
        size: 3,
        map: particleTexture,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const planetSystem = new THREE.Points(planetGeo, planetMat);
    planetSystem.name = 'core-body';
    group.add(planetSystem);

    // ---------- 星环(原版 243-275 行,逐行对应) ----------
    const createRing = (radiusInner, radiusOuter, count, tiltX, tiltZ) => {
        const geo = new THREE.BufferGeometry();
        const pos = [];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            // 环的半径分布
            const r = THREE.MathUtils.lerp(radiusInner, radiusOuter, Math.random());
            const x = r * Math.cos(angle);
            const y = (Math.random() - 0.5) * 2; // 环的厚度极薄
            const z = r * Math.sin(angle);
            pos.push(x, y, z);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            color: CORE_CONFIG.ringColor,
            size: 2,
            map: particleTexture,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const sys = new THREE.Points(geo, mat);
        sys.rotation.x = tiltX;
        sys.rotation.z = tiltZ;
        return sys;
    };

    const ringSystem1 = createRing(70, 110, CORE_CONFIG.ringParticleCount, Math.PI / 3, Math.PI / 6);
    const ringSystem2 = createRing(80, 140, CORE_CONFIG.ringParticleCount, -Math.PI / 4, -Math.PI / 8);

    ringSystem1.name = 'core-ring-1';
    ringSystem2.name = 'core-ring-2';
    group.add(ringSystem1);
    group.add(ringSystem2);

    // ---------- 点击检测目标(不可见,方便 raycaster 命中) ----------
    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(60, 32, 32),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.name = 'core-click';
    group.add(clickTarget);

    // ---------- 动画钩子 + 子对象引用 ----------
    group.userData.tick = (time) => {
        planetSystem.rotation.y = time * 0.1;
        ringSystem1.rotation.z -= 0.002;
        ringSystem2.rotation.z += 0.003;
    };
    group.userData.clickTarget = clickTarget;
    group.userData.coreBody = planetSystem;
    group.userData.ring1 = ringSystem1;
    group.userData.ring2 = ringSystem2;

    return group;
}

/**
 * 核心星球规格 —— 交给装配器的对接描述
 */
export const coreSpec = {
    name: 'core',                    // 必须与 group.name 一致
    type: PlanetType.STAR,           // 主星
    factory: createCorePlanet,
    orbit: {
        radius: 0,                   // 主星居中,无轨道偏移
        speed: 0                     // 不自转公转
    },
    appearance: {
        palette: [0xff6600, 0xffffff],
        supportsColorCustomization: false
    },
    info: {
        title: '核心恒星',
        subtitle: '星系的心脏 · 炽热的橙色主序星',
        rows: [
            { label: '类型', value: 'G 型主序星' },
            { label: '表面温度', value: '约 5500℃' },
            { label: '质量', value: '~1.2 倍太阳' },
            { label: '半径', value: '约 70 万公里' },
            { label: '光谱型', value: 'G2V' }
        ],
        description: '星系的能量核心，由氢氦核聚变维持的炽热等离子球。双星环由早期物质遗留形成，呈现出独特的倾斜角度与差速旋转。它的光芒照耀着整个星系，是所有行星的公转中心。'
    }
};
