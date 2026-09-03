// src/PlanetSpec.js
// 星球对接契约 —— 成员星球必须符合本契约才能被装配进 galaxy.html
// 维护者:架构协调者
// ====================================================================
// 【给成员的对接说明】
//   1. 复制 src/planets/core.js 作为样板(它是原始星球的美感基准)
//   2. 你的文件须导出一个 spec 对象,结构见下方 PlanetSpec 注释
//   3. factory() 返回 THREE.Group,以 (0,0,0) 为中心 —— 轨道偏移由装配器做
//   4. 动画写进 group.userData.tick(time),不要自己搞 requestAnimationFrame
//   5. 纹理必须用共享的:import { particleTexture } from '../particleTexture.js'
//   6. 自检:在文件末尾加 assertValidSpec(yourSpec),控制台无报错即合格
// ====================================================================
// 【形态各异的自由度】
//   - 粒子形状/数量/颜色/大小/透明度、内部子对象层级、group.scale 整体缩放:全部自由
//   - 建议美术半径控制在 30~80(相机 minDistance=120,太大会怼脸)
// 【禁止清单】(违反 = 装配报错或评审打回)
//   - 禁止 requestAnimationFrame / setInterval 自建动画循环,动画一律写 userData.tick
//   - 禁止创建相机 / 渲染器 / 修改 scene、fog、后期处理(你只拥有你的 Group)
//   - 禁止 new THREE.CanvasTexture 自制纹理(必须用共享 particleTexture,保证光点风格统一)
// 【userData 能力钩子】"功能各异"的正确出口 —— 装配器自动识别,没写就跳过
//   userData.tick(time)                     必须:每帧动画,time 每帧 +0.005
//   userData.setColor(primary, secondary)   可选:主系统改色时调用
//   userData.onClick()                      可选:预留点击交互(Day 6+ raycaster)
//   userData.onHover()                      可选:预留悬停交互
// ====================================================================

import * as THREE from 'three';

/** 性能预算 —— 装配时自动统计,超限直接抛错当场打回
 * 依据:60fps 目标 + 原版单星球 16000 粒子实测流畅;真正瓶颈是 additive 混合的填充率(粒子重叠层数)而非顶点数
 * 验收标准:5 星球全装配后实机帧率,红线可据此再调 */
export const BUDGETS = {
    maxParticles: 60000,    // 单星球粒子总数上限(core 基准 16000)
    maxRenderables: 12      // 单星球可渲染对象(Points/Mesh)上限(core 基准 3)
};

/** 星球类型枚举 */
export const PlanetType = {
    STAR: 'star',       // 主星:必须居中,orbit 全 0
    PLANET: 'planet'    // 行星:按 orbit 绕主星公转
};

/**
 * spec 对象结构说明:
 * {
 *   name: 'planet1',                  // string,唯一标识,必须与 factory 返回的 group.name 一致
 *   type: PlanetType.PLANET,          // PlanetType 枚举
 *   factory: createPlanet1,           // () => THREE.Group,内含星球全部美术
 *   orbit: {                          // 轨道参数(STAR 必须全 0)
 *     radius: 0,                      //   轨道半径(到中心的距离),>=0
 *     speed: 0                        //   公转角速度(弧度/帧)
 *   },
 *   appearance: {
 *     palette: [0xff6600, 0xffffff],  // 本星球使用的颜色表(供检索/调试)
 *     supportsColorCustomization: false  // 主星如支持改色,须挂 userData.setColor(primary, secondary)
 *   },
 *   info: {                           // 可选:UI 信息面板数据源
 *     title: '卡冈图雅',
 *     subtitle: '超大质量旋转黑洞',
 *     rows: [                          // 键值对数组,面板逐行显示
 *       { label: '类型', value: '克尔黑洞' },
 *       { label: '质量', value: '~1亿倍太阳' }
 *     ],
 *     description: '一段描述文字...'
 *   }
 * }
 */

/**
 * 校验 spec 静态结构(装配前调用)
 * @param {*} spec
 * @throws {Error} 不符合契约时抛出,错误信息指明具体问题
 */
export function validatePlanetSpec(spec) {
    const problems = [];

    if (!spec || typeof spec !== 'object') {
        throw new Error('[PlanetSpec] spec 必须是对象');
    }
    if (typeof spec.name !== 'string' || spec.name.length === 0) {
        problems.push('name 必须是非空字符串');
    }
    if (!Object.values(PlanetType).includes(spec.type)) {
        problems.push(`type 必须是 PlanetType 之一(${Object.values(PlanetType).join('/')})`);
    }
    if (typeof spec.factory !== 'function') {
        problems.push('factory 必须是函数');
    }
    if (!spec.orbit || typeof spec.orbit !== 'object') {
        problems.push('orbit 必须是 { radius, speed } 对象');
    } else {
        if (typeof spec.orbit.radius !== 'number' || spec.orbit.radius < 0) {
            problems.push('orbit.radius 必须是 >= 0 的数字');
        }
        if (typeof spec.orbit.speed !== 'number') {
            problems.push('orbit.speed 必须是数字');
        }
        if (spec.type === PlanetType.STAR && (spec.orbit.radius !== 0 || spec.orbit.speed !== 0)) {
            problems.push('STAR 类型的 orbit.radius 和 orbit.speed 必须都为 0');
        }
    }
    if (!spec.appearance || !Array.isArray(spec.appearance.palette) || spec.appearance.palette.length === 0) {
        problems.push('appearance.palette 必须是非空颜色数组');
    }

    if (problems.length > 0) {
        throw new Error(`[PlanetSpec] spec "${spec && spec.name}" 校验失败:\n  - ${problems.join('\n  - ')}`);
    }
    return true;
}

/**
 * 校验 factory() 的运行时输出(装配时调用)
 * @param {*} obj
 * @param {{name: string}} spec
 */
export function validateFactoryOutput(obj, spec) {
    const problems = [];

    if (!(obj instanceof THREE.Object3D)) {
        throw new Error(`[PlanetSpec] "${spec.name}" 的 factory() 必须返回 THREE.Object3D(通常是 THREE.Group)`);
    }
    if (obj.name !== spec.name) {
        problems.push(`group.name("${obj.name}") 必须与 spec.name("${spec.name}") 一致`);
    }
    if (obj.position.lengthSq() !== 0) {
        problems.push('group 必须以 (0,0,0) 为中心,轨道偏移由装配器处理,不要自己位移');
    }

    // 性能预算统计(装配时一次性检查,超限当场打回)
    let particles = 0;
    let renderables = 0;
    obj.traverse((child) => {
        if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
            renderables++;
            particles += child.geometry.attributes.position.count;
        }
    });
    if (particles > BUDGETS.maxParticles) {
        problems.push(`粒子总数 ${particles} 超出预算 ${BUDGETS.maxParticles}(core 基准 16000),请降采样`);
    }
    if (renderables > BUDGETS.maxRenderables) {
        problems.push(`可渲染对象 ${renderables} 个超出预算 ${BUDGETS.maxRenderables}(core 基准 3),请合并几何体`);
    }

    if (problems.length > 0) {
        throw new Error(`[PlanetSpec] "${spec.name}" factory() 输出校验失败:\n  - ${problems.join('\n  - ')}`);
    }
    return true;
}

/** 校验 + 失败直接抛错(装配器用) */
export function assertValidSpec(spec) {
    validatePlanetSpec(spec);
    return spec;
}
