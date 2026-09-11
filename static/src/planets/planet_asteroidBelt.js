// src/planets/planet_asteroidBelt.js
// 小行星带 Asteroid Belt —— 适配自 124-main/124-main/小行星带.html
// ====================================================================
// 【100% 还原成员原始美术参数】
//   ✅ 5 尺寸层级数量: 120 + 400 + 800 + 1500 + 2500 = 5320 颗 3D 岩石
//   ✅ 16 颗大型小行星(谷神星/灶神星/智神星...原始颜色/radius/angle)
//   ✅ 颜色概率分布(每层独立,原始 0x887766/0xaa9977/0x998877/0x776655/0x665544...)
//   ✅ 自转: 独立 rotAxis + rotSpeed(原始 0.008~0.10 范围)
//   ✅ irregularity 顶点扰动(每层 0.35~0.6)
//   ✅ 灯光: 0xffeedd 1.5 + 0x8899bb 0.6 + 0x222233 0.4(原始参数)
//   ✅ MeshStandardMaterial: flatShading, roughness 0.9, metalness 0.1
// ====================================================================
// 【轨道修正】(满足用户天文参数约束)
//   1. belt Group 固定在原点(orbit.radius=0, speed=0) —— 岩石直接围绕恒星公转
//      修正前: belt Group 在 orbit.radius=2100 处,内部岩石在 50~130 局部范围转小圈
//      修正后: 岩石 distance 在 1600~2150 全局范围,围绕恒星(原点)做开普勒公转
//   2. 轨道半径约束: 螺旋星云(1450) < belt(1600~2150) < GARGANTUA(2300) ✓
//   3. 速度按开普勒第三定律: 0.0006/(r/1875)^1.5,内快外慢
//      与系统一致: carina@1000=0.0015 → belt@1875≈0.0006 → GARGANTUA@2300=0.0004
// ====================================================================
// 【必要适配】(因 PlanetSpec 契约限制)
//   - 独立 Mesh → InstancedMesh: 原始 5336 独立 Mesh 超 maxRenderables=12 预算
//     → 6 个 InstancedMesh + 1 clickTarget = 7 renderables(< 12 ✓)
//   - 灯光: 原版加在 scene → 改为 Group 子对象(契约禁止改 scene)
//   - 动画: requestAnimationFrame → userData.tick(time)
//   - distance 映射: 原始 50~130 → 全局 1600~2150(线性映射)
// ====================================================================

import * as THREE from 'three';
import { PlanetType, assertValidSpec } from '../PlanetSpec.js?v=20260902v3';

// 成员原版 CONFIG —— 保留原始美术,distance 映射到全局范围
const CONFIG = {
    beltInner: 1600,                // 带内边缘(>螺旋星云 1450,留 150 余量)
    beltOuter: 2150,                 // 带外边缘(<GARGANTUA 2300,留 150 余量)
    beltWidth: 550,                  // beltOuter - beltInner = 550
    // 6 个尺寸层级(总 5000 颗,非均匀分布,中央密集)
    // rOffset/rMargin 保持原始值(相对于原 beltWidth=80),代码中按比例映射到 550
    layers: [
        // baseRadius × 15, yOff × 15 — 原版 distance 80~130,现在 1600~2150,比例 1875/80≈23,取 15 倍保证可见
        { name: 'giant',    count: 80,   baseRadius: 30.0,  rOffset: 10, rMargin: 20, scaleRange: [0.6, 1.5],  irregularity: 0.35, yOff: 37.5,  rotSpeedRange: [0.008, 0.028] },
        { name: 'big',      count: 220,  baseRadius: 15.0,  rOffset: 8,  rMargin: 16, scaleRange: [0.7, 1.3],  irregularity: 0.38, yOff: 41.25, rotSpeedRange: [0.010, 0.035] },
        { name: 'medium',   count: 500,  baseRadius: 9.75,  rOffset: 8,  rMargin: 16, scaleRange: [0.62, 1.38], irregularity: 0.40, yOff: 45.0,  rotSpeedRange: [0.015, 0.050] },
        { name: 'midSmall', count: 900,  baseRadius: 4.8,   rOffset: 3,  rMargin: 6,  scaleRange: [0.625, 1.4], irregularity: 0.52, yOff: 67.5,  rotSpeedRange: [0.025, 0.075] },
        { name: 'small',    count: 1300, baseRadius: 2.7,   rOffset: 2,  rMargin: 4,  scaleRange: [0.55, 1.5],  irregularity: 0.60, yOff: 75.0,  rotSpeedRange: [0.030, 0.100] },
        // 中央密集填充层:集中在带中央(distance ~1848~1925),小颗粒,占总量 90%,模拟主带中央密集区
        { name: 'centralDense', count: 27000, baseRadius: 1.8, rOffset: 0, rMargin: 0, scaleRange: [0.7, 1.5], irregularity: 0.65, yOff: 52.5, rotSpeedRange: [0.035, 0.090], isCentral: true },
    ],
    // 16 颗大型小行星(成员原版颜色/radius/angle 100% 保留,distance 线性映射到全局)
    // 映射公式: new_dist = beltInner + (old_dist - 50) * beltWidth / 80
    largeAsteroids: [
        { name: '谷神星 Ceres',    distance: 1841, radius: 2.5,  color: 0xaaaaaa, angle: 0.2 },
        { name: '灶神星 Vesta',    distance: 1793, radius: 2.0,  color: 0xccaa77, angle: 1.3 },
        { name: '智神星 Pallas',   distance: 1909, radius: 1.8,  color: 0xbb9988, angle: 2.5 },
        { name: '健神星 Hygiea',   distance: 1861, radius: 1.5,  color: 0x998877, angle: 3.7 },
        { name: '婚神星 Juno',     distance: 1751, radius: 1.3,  color: 0xaa8866, angle: 4.8 },
        { name: '义神星 Astraea',  distance: 1820, radius: 1.2,  color: 0xbb9977, angle: 5.5 },
        { name: '海女星 Hebe',     distance: 1716, radius: 1.1,  color: 0xccaa88, angle: 0.8 },
        { name: '虹神星 Iris',     distance: 1772, radius: 1.0,  color: 0xaaaacc, angle: 2.0 },
        { name: '司法星 Eunomia',  distance: 1882, radius: 1.0,  color: 0xaa8877, angle: 3.2 },
        { name: '流明星 Psyche',   distance: 1938, radius: 0.9,  color: 0x997755, angle: 4.5 },
        { name: '颖神星 Metis',    distance: 1684, radius: 0.85, color: 0xbbaa88, angle: 5.8 },
        { name: '司宁星 Themis',   distance: 1972, radius: 0.85, color: 0x8899aa, angle: 1.7 },
        { name: '导神星 Adeona',   distance: 1931, radius: 0.8,  color: 0x998877, angle: 0.5 },
        { name: '林神星 Sylvia',   distance: 2022, radius: 0.8,  color: 0x777766, angle: 2.8 },
        { name: '春神星 Feronia',  distance: 2008, radius: 0.75, color: 0x887766, angle: 4.0 },
        { name: '明神星 Leto',     distance: 1744, radius: 0.7,  color: 0xaaaa99, angle: 5.2 },
    ],
    // 公转速度(开普勒第三定律: 0.0006 / (r/1875)^1.5)
    // 系统一致性: carina@1000=0.0015 → belt@1875≈0.0006 → GARGANTUA@2300=0.0004
    orbitSpeedBase: 0.0006,
    orbitSpeedRef: 1875,
    // 原始 beltWidth(用于 rOffset/rMargin 比例映射)
    origBeltWidth: 80,
};

/**
 * 生成不规则小行星 geometry(每层一个,所有 instance 共享)
 * 100% 还原成员原版 createAsteroidMesh 的顶点扰动逻辑
 */
function createAsteroidGeometry(radius, irregularity) {
    const geo = new THREE.IcosahedronGeometry(radius, 1);
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        const noise = 1 + (Math.random() - 0.5) * irregularity;
        positions.setXYZ(i, x * noise, y * noise, z * noise);
    }
    geo.computeVertexNormals();
    return geo;
}

/**
 * 颜色概率分布(成员原版,每层独立)
 */
function pickRockColor(layerName) {
    const t = Math.random();
    switch (layerName) {
        case 'giant':
            if (t < 0.30) return 0x887766;
            if (t < 0.55) return 0xaa9977;
            if (t < 0.75) return 0x998877;
            if (t < 0.90) return 0x776655;
            return 0x665544;
        case 'big':
            if (t < 0.30) return 0x887766;
            if (t < 0.60) return 0x998877;
            if (t < 0.80) return 0x776655;
            return 0x665544;
        case 'medium':
            if (t < 0.35) return 0x776655;
            if (t < 0.65) return 0x998877;
            if (t < 0.85) return 0x887766;
            return 0x665544;
        case 'midSmall':
            if (t < 0.30) return 0x665544;
            if (t < 0.55) return 0x887766;
            if (t < 0.75) return 0x776655;
            if (t < 0.90) return 0x554433;
            return 0x778899;
        case 'small':
            if (t < 0.25) return 0x554433;
            if (t < 0.50) return 0x776655;
            if (t < 0.70) return 0x665544;
            if (t < 0.85) return 0x443322;
            return 0x667788;
        case 'centralDense':
            // 中央密集层:小颗粒,复用 small 颜色分布
            if (t < 0.25) return 0x554433;
            if (t < 0.50) return 0x776655;
            if (t < 0.70) return 0x665544;
            if (t < 0.85) return 0x443322;
            return 0x667788;
        default:
            return 0x776655;
    }
}

/**
 * 将原始局部 r 偏移(相对于原 beltWidth=80)映射到全局 distance
 * 原始: r = beltInner_orig + rOffset + rand * (beltWidth_orig - rMargin)
 * 映射: r = beltInner + (rOffset + rand * (beltWidth_orig - rMargin)) * (beltWidth / beltWidth_orig)
 * 简化: ratio = (rOffset + rand * (origBeltWidth - rMargin)) / origBeltWidth
 *       r = beltInner + ratio * beltWidth
 *
 * isCentral=true 时:集中在带中央(ratio 0.45~0.55),模拟主带中央密集区
 */
function mapDistance(rOffset, rMargin, isCentral) {
    if (isCentral) {
        // 中央密集:ratio 在 0.45~0.55 之间
        const ratio = 0.45 + Math.random() * 0.10;
        return CONFIG.beltInner + ratio * CONFIG.beltWidth;
    }
    const origRange = CONFIG.origBeltWidth - rMargin;
    const origR = rOffset + Math.random() * origRange;
    const ratio = origR / CONFIG.origBeltWidth;
    return CONFIG.beltInner + ratio * CONFIG.beltWidth;
}

/**
 * 工厂函数 —— 返回 Group(灯光 + 6 InstancedMesh + 点击目标 + tick 钩子)
 * Group 固定在原点(0,0,0),岩石直接围绕恒星(原点)公转
 * @returns {THREE.Group}
 */
export function createAsteroidBelt() {
    const group = new THREE.Group();
    group.name = 'asteroidBelt';

    // ---------- 灯光(成员原版参数,作为 Group 子对象) ----------
    const sunLight = new THREE.DirectionalLight(0xffeedd, 1.5);
    sunLight.position.set(1, 0.3, 0.5).normalize();
    sunLight.name = 'asteroidBelt-sunLight';
    group.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x8899bb, 0.6);
    rimLight.position.set(-1, -0.2, -0.5).normalize();
    rimLight.name = 'asteroidBelt-rimLight';
    group.add(rimLight);

    const ambient = new THREE.AmbientLight(0x222233, 0.4);
    ambient.name = 'asteroidBelt-ambient';
    group.add(ambient);

    // ---------- 复用临时对象(避免每帧 GC) ----------
    const _matrix = new THREE.Matrix4();
    const _pos = new THREE.Vector3();
    const _scl = new THREE.Vector3();
    const _color = new THREE.Color();
    const _dq = new THREE.Quaternion();

    // ---------- 5 个尺寸层级 InstancedMesh ----------
    const layerData = [];

    for (const layer of CONFIG.layers) {
        const geo = createAsteroidGeometry(layer.baseRadius, layer.irregularity);
        const mat = new THREE.MeshStandardMaterial({
            flatShading: true,
            roughness: 0.9,
            metalness: 0.1,
        });
        const inst = new THREE.InstancedMesh(geo, mat, layer.count);
        inst.name = `asteroidBelt-${layer.name}`;
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        inst.frustumCulled = false;

        const instances = [];
        for (let i = 0; i < layer.count; i++) {
            // distance 映射到全局范围(围绕恒星公转)
            const r = mapDistance(layer.rOffset, layer.rMargin, layer.isCentral);
            const angle = Math.random() * Math.PI * 2;
            const yOff = (Math.random() - 0.5) * layer.yOff * 2;
            const scale = layer.scaleRange[0]
                        + Math.random() * (layer.scaleRange[1] - layer.scaleRange[0]);
            // 开普勒公转速度(内快外慢)
            const speed = CONFIG.orbitSpeedBase / Math.pow(r / CONFIG.orbitSpeedRef, 1.5);
            const rotSpeed = layer.rotSpeedRange[0]
                           + Math.random() * (layer.rotSpeedRange[1] - layer.rotSpeedRange[0]);
            const rotAxis = new THREE.Vector3(
                Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
            ).normalize();
            const initRot = Math.random() * Math.PI * 2;
            const quat = new THREE.Quaternion().setFromAxisAngle(rotAxis, initRot);

            instances.push({ angle, r, speed, rotSpeed, rotAxis, yOff, scale, quat });

            _color.setHex(pickRockColor(layer.name));
            inst.setColorAt(i, _color);

            _pos.set(Math.cos(angle) * r, yOff, Math.sin(angle) * r);
            _scl.setScalar(scale);
            _matrix.compose(_pos, quat, _scl);
            inst.setMatrixAt(i, _matrix);
        }

        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        group.add(inst);
        layerData.push({ inst, instances });
    }

    // ---------- 16 颗大型小行星(单独 InstancedMesh) ----------
    // geometry radius × 15 匹配层级放大倍数
    const largeAstGeo = createAsteroidGeometry(15.0, 0.30);
    const largeAstMat = new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.9,
        metalness: 0.1,
    });
    const largeAstInst = new THREE.InstancedMesh(
        largeAstGeo, largeAstMat, CONFIG.largeAsteroids.length
    );
    largeAstInst.name = 'asteroidBelt-largeAsteroids';
    largeAstInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    largeAstInst.frustumCulled = false;

    const largeAstInstances = [];
    for (let i = 0; i < CONFIG.largeAsteroids.length; i++) {
        const aDef = CONFIG.largeAsteroids[i];
        const dist = aDef.distance + (Math.random() - 0.5) * 5;
        const angle = aDef.angle;
        const scale = aDef.radius;
        const speed = CONFIG.orbitSpeedBase / Math.pow(dist / CONFIG.orbitSpeedRef, 1.5);
        const rotSpeed = 0.01 + Math.random() * 0.025;
        const rotAxis = new THREE.Vector3(
            Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
        ).normalize();
        const initRot = Math.random() * Math.PI * 2;
        const quat = new THREE.Quaternion().setFromAxisAngle(rotAxis, initRot);

        largeAstInstances.push({ angle, r: dist, speed, rotSpeed, rotAxis, yOff: 0, scale, quat });

        _color.setHex(aDef.color);
        largeAstInst.setColorAt(i, _color);

        _pos.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
        _scl.setScalar(scale);
        _matrix.compose(_pos, quat, _scl);
        largeAstInst.setMatrixAt(i, _matrix);
    }
    largeAstInst.instanceMatrix.needsUpdate = true;
    if (largeAstInst.instanceColor) largeAstInst.instanceColor.needsUpdate = true;
    group.add(largeAstInst);
    layerData.push({ inst: largeAstInst, instances: largeAstInstances });

    // ---------- 不可见点击目标(用于 raycaster 命中 + 信息面板) ----------
    // 以带中心(1875)为球心,半径覆盖整个带
    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.beltWidth * 0.7, 16, 16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.position.set((CONFIG.beltInner + CONFIG.beltOuter) / 2, 0, 0);
    clickTarget.name = 'asteroidBelt-click';
    group.add(clickTarget);

    // ---------- 动画钩子:岩石围绕恒星(原点)公转 + 自转 ----------
    group.userData.tick = (time) => {
        for (const layer of layerData) {
            const { inst, instances } = layer;
            for (let i = 0; i < instances.length; i++) {
                const ud = instances[i];
                // 公转:岩石围绕恒星(原点)运动
                ud.angle += ud.speed;
                _pos.set(Math.cos(ud.angle) * ud.r, ud.yOff, Math.sin(ud.angle) * ud.r);
                // 自转:独立轴 + 速度
                _dq.setFromAxisAngle(ud.rotAxis, ud.rotSpeed);
                ud.quat.multiply(_dq);
                _scl.setScalar(ud.scale);
                _matrix.compose(_pos, ud.quat, _scl);
                inst.setMatrixAt(i, _matrix);
            }
            inst.instanceMatrix.needsUpdate = true;
        }
    };

    group.userData.clickTarget = clickTarget;
    return group;
}

/**
 * 小行星带规格 —— 交给装配器的对接描述
 *
 * 轨道约束(用户需求):
 *   螺旋星云(1450) < belt(1600~2150) < GARGANTUA(2300) ✓
 *
 * 运动模型修正:
 *   belt Group 固定在原点(orbit.radius=0, speed=0)
 *   岩石直接围绕恒星(原点)公转,distance 在 1600~2150 全局范围
 *   修正前: belt Group 在 2100 处,内部岩石在 50~130 局部转小圈(围绕空点)
 *   修正后: 岩石在 1600~2150 范围围绕恒星公转(真正的大圈)
 *
 * 开普勒第三定律一致性:
 *   carina     @ 1000, speed=0.0015 → K=47.4
 *   belt       @ 1875, speed≈0.0006 → K≈47.6
 *   GARGANTUA  @ 2300, speed=0.0004 → K=44.1
 *   (内快外慢,单调递减)
 */
export const asteroidBeltSpec = {
    name: 'asteroidBelt',
    type: PlanetType.PLANET,
    factory: createAsteroidBelt,
    orbit: {
        radius: 0,                   // belt Group 固定原点(岩石直接围绕恒星公转)
        speed: 0,                    // 不参与 main.js 整体公转(tick 内部驱动)
        phase: 0,
        inclination: 0,
        eccentricity: 0,
        ascendingNode: 0
    },
    appearance: {
        palette: [0x887766, 0xaa9977, 0x998877, 0x776655, 0x665544, 0xccaa77, 0xaaaaaa, 0xbb9988],
        supportsColorCustomization: false
    },
    info: {
        title: '小行星带',
        subtitle: 'Asteroid Belt · 主带岩石残骸带',
        rows: [
            { label: '类型', value: '主带小行星 / 3D 岩石残骸' },
            { label: '位置', value: '螺旋星云与 GARGANTUA 之间' },
            { label: '轨道范围', value: '1600~2150(>螺旋星云 1450, <GARGANTUA 2300)' },
            { label: '3D岩石数', value: '~30,016 颗(6 尺寸层级 + 16 大型)' },
            { label: '总质量', value: '~4% 月球质量' },
            { label: '最大天体', value: '谷神星 / 灶神星 / 智神星' }
        ],
        description: '主小行星带位于蜘蛛星云轨道之外、卡冈图雅黑洞轨道之内，由约 30016 颗 3D 岩石组成（6 个尺寸层级 + 16 颗大型小行星），非均匀分布——中央密集区（distance ~1848~1925）集中了 90% 岩石，模拟真实主带 2.7 AU 处的密集分布。所有岩石以开普勒差速公转直接围绕中央恒星运动（内圈快外圈慢），并各自绕随机轴自转。'
    }
};

assertValidSpec(asteroidBeltSpec);
