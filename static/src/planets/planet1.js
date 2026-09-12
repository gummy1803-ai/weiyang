// src/planets/planet1.js
// 成员 B 的黑洞行星 —— 100% 还原成员原始美术参数,仅做必要适配
// ====================================================================
// 【还原说明】
//   ✅ 100% 还原成员原始参数:CONFIG(半径/粒子数/颜色/opacity/size/动画速度)
//   ✅ 必要适配 1:BackSide → DoubleSide(成员原版相机在黑洞近场/内部,
//      我们的相机在外部,BackSide 三角形从外部看不见,必须改 DoubleSide)
//   ✅ 必要适配 2:共享 particleTexture(契约禁止自建 CanvasTexture)
//   ✅ 必要适配 3:排除 starfield/orbitalTrails/raycaster 等场景交互元素
//   ✅ 必要适配 4:动画从 requestAnimationFrame → userData.tick(time)
//   ❌ 未经授权不修改任何颜色/opacity/size/半径倍数 —— 成员的美术,成员说了算
// ====================================================================

import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js';
import { PlanetType } from '../PlanetSpec.js';

// 成员原版 CONFIG —— 零修改
const CONFIG = {
    blackHoleRadius: 30,
    diskInnerRadius: 35,
    diskOuterRadius: 100,
    diskParticleCount: 12000
};

/**
 * 黑洞行星工厂 —— 返回 Group(事件视界 + 边缘亮环 + 光子球 + 吸积盘 + 透镜环)
 * 以 (0,0,0) 为中心,轨道偏移由装配器(main.js)处理
 * @returns {THREE.Group}
 */
export function createPlanet1() {
    const group = new THREE.Group();
    group.name = 'planet1';

    // ---------- 黑洞事件视界(成员原版:纯黑 FrontSide) ----------
    // 必要适配:加 depthWrite:false,避免遮挡后面的 BackSide/DoubleSide 环
    const blackHole = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.blackHoleRadius, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: false })
    );
    blackHole.name = 'planet1-core';
    group.add(blackHole);

    // ---------- 黑洞边缘亮环(成员原版:0xffeeaa, opacity 0.35, BackSide) ----------
    // 必要适配:BackSide → DoubleSide(我们的相机在外部,BackSide 看不见)
    const edgeRing = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.blackHoleRadius * 1.02, 64, 64),
        new THREE.MeshBasicMaterial({
            color: 0xffeeaa,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,  // 原:THREE.BackSide —— 必要适配
            blending: THREE.AdditiveBlending,
            depthWrite: false
        })
    );
    edgeRing.name = 'planet1-edge';
    group.add(edgeRing);

    // ---------- 光子球辉光(成员原版:0xffcc66, opacity 0.2, BackSide) ----------
    // 必要适配:BackSide → DoubleSide
    const photonRing = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.blackHoleRadius * 1.08, 64, 64),
        new THREE.MeshBasicMaterial({
            color: 0xffcc66,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,  // 原:THREE.BackSide —— 必要适配
            blending: THREE.AdditiveBlending,
            depthWrite: false
        })
    );
    photonRing.name = 'planet1-photon';
    group.add(photonRing);

    // ---------- 吸积盘(成员原版:size 3, opacity 0.9) ----------
    const accretionDisk = createAccretionDisk();
    accretionDisk.name = 'planet1-disk';
    group.add(accretionDisk);

    // ---------- 引力透镜环(成员原版:size 3, opacity 0.7) ----------
    const lensingRing = createLensingRing();
    lensingRing.name = 'planet1-lens';
    group.add(lensingRing);

    // ---------- 点击检测目标(不可见,方便 raycaster 命中,比黑洞略大) ----------
    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.blackHoleRadius * 2.5, 32, 32),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.name = 'planet1-click';
    group.add(clickTarget);

    // ---------- 动画钩子 + 子对象引用(供 main.js raycaster / 星系形成 / 内部模式访问) ----------
    group.userData.tick = (time) => {
        accretionDisk.rotation.y += 0.001;
        lensingRing.rotation.z += 0.0005;
        const pulse = 1 + Math.sin(time * 2) * 0.02;
        photonRing.scale.set(pulse, pulse, pulse);
    };
    group.userData.clickTarget = clickTarget;
    group.userData.blackHole = blackHole;
    group.userData.accretionDisk = accretionDisk;
    group.userData.lensingRing = lensingRing;
    group.userData.photonRing = photonRing;
    group.userData.edgeRing = edgeRing;

    return group;
}

/** 吸积盘:成员原版 —— 12000 粒子,size 3, opacity 0.9, 颜色公式原样 */
function createAccretionDisk() {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const innerR = CONFIG.diskInnerRadius;
    const outerR = CONFIG.diskOuterRadius;

    for (let i = 0; i < CONFIG.diskParticleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = THREE.MathUtils.lerp(innerR, outerR, Math.pow(Math.random(), 0.5));
        const thickness = (Math.random() - 0.5) * 3;

        positions.push(r * Math.cos(angle), thickness, r * Math.sin(angle));

        const t = (r - innerR) / (outerR - innerR);
        colors.push(1.0 - t * 0.3, 0.9 - t * 0.6, 0.7 - t * 0.65);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
    }));
}

/** 引力透镜环:成员原版 —— count 0.35, size 3, opacity 0.7, 颜色公式原样 */
function createLensingRing() {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const innerR = CONFIG.diskInnerRadius * 1.1;
    const outerR = CONFIG.diskOuterRadius * 0.9;
    const count = Math.floor(CONFIG.diskParticleCount * 0.35);

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = THREE.MathUtils.lerp(innerR, outerR, Math.pow(Math.random(), 0.8));

        positions.push(r * Math.cos(angle), r * Math.sin(angle), (Math.random() - 0.5) * 2);

        const t = (r - innerR) / (outerR - innerR);
        colors.push(1.0 - t * 0.3, 0.85 - t * 0.6, 0.6 - t * 0.55);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false
    }));
}

/**
 * planet1 规格 —— 交给装配器的对接描述
 * orbit.radius / speed 为装配层定位决策,非成员美术参数
 * 安全间距阈值:核心星视觉外缘 140(星环外半径) + 黑洞视觉外缘 100(吸积盘外半径)
 *   = 最小接触距离 240;定位半径取 550(约 2.3 倍余量),公转速度 0.001 保持不变
 */
export const planet1Spec = {
    name: 'planet1',
    type: PlanetType.PLANET,
    factory: createPlanet1,
    orbit: {
        radius: 2300,               // 最外环 · 系统边界天体(间距350均布)
        speed: 0.0004,              // 开普勒:最远→最慢(×√2:恒星质量2倍)
        phase: Math.PI / 2,        // 90° 错开
        inclination: 0.35,          // 倾角 20°(黑洞轨道大幅倾斜,视觉醒目)
        eccentricity: 0.50,        // 偏心率 0.50(高偏心轨道,近星点远、远星点更远)
        ascendingNode: 1.0          // 升交点方向独立
    },
    appearance: {
        palette: [0x000000, 0xffeeaa, 0xffcc66],
        supportsColorCustomization: false
    },
    // 队友 Downloads/index.html 第 573-586 行的 GARGANTUA 面板数据
    info: {
        title: 'GARGANTUA',
        subtitle: '卡冈图雅 · 超大质量旋转黑洞',
        rows: [
            { label: '类型', value: '克尔黑洞（旋转）' },
            { label: '质量', value: '~1亿倍太阳质量' },
            { label: '事件视界半径', value: '约 3 AU' },
            { label: '吸积盘温度', value: '内缘 6000℃+' },
            { label: '自转速率', value: '接近光速的 99.8%' }
        ],
        description: '卡冈图雅是电影《星际穿越》中的核心天体，一颗正在吞噬周围物质的超大质量旋转黑洞。其强大的引力使周围时空发生剧烈扭曲，产生了壮观的吸积盘与引力透镜效应。靠近事件视界的区域，时间流逝将显著变慢。'
    }
};
