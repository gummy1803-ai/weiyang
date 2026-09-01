// src/PlanetSpec.js
// 星球组件接口规范 —— 所有星球工厂模块必须符合此契约
// 维护者:架构协调者
// 冻结时间:Day 1 22:00(冻结前可改,冻结后变更需全员评审)

// ===== 常量预算(硬约束,超出即不合规)=====
export const BUDGETS = {
    MAX_PARTICLES_PER_PLANET: 8000,   // 单星球粒子上限
    MAX_PARTICLES_TOTAL: 50000,      // 全场景粒子上限(装配时监控)
    CORE_RADIUS_MIN: 20,
    CORE_RADIUS_MAX: 80,
    ORBIT_RADIUS_MIN: 80,
    ORBIT_RADIUS_MAX: 700,
    ORBIT_SPEED_MIN: 0.001,
    ORBIT_SPEED_MAX: 0.03,
    INCLINATION_RANGE: Math.PI / 4   // 轨道倾角绝对值上限
};

// ===== 星球类型枚举 =====
export const PlanetType = {
    STAR: 'star',     // 主星(中央,不公转)
    PLANET: 'planet'  // 行星(绕中心公转)
};

/**
 * PlanetSpec 接口规范
 *
 * 每个星球模块必须导出一个符合此结构的对象,由 main.js 装配进场景。
 *
 * @typedef {Object} PlanetSpec
 * @property {string} name                  - 唯一标识(用于 scene.getObjectByName 检索)
 * @property {'star'|'planet'} type          - 星球类型
 * @property {() => THREE.Object3D} factory  - 工厂函数,返回完整星球对象(本体+星环)
 *                                             约定:返回对象必须以 (0,0,0) 为中心
 *                                             轨道偏移由 main.js 的父 Group 处理,设计师不要自己位移
 * @property {Object} orbit                 - 轨道参数(主星全部为 0)
 * @property {number} orbit.radius          - 距系统中心距离 [80,700]
 * @property {number} orbit.speed          - 公转角速度 [0.001,0.03]
 * @property {number} orbit.inclination     - 轨道倾角 [-π/4,π/4]
 * @property {Object} appearance           - 外观参数
 * @property {number} appearance.coreRadius       - 星球本体半径 [20,80]
 * @property {number} appearance.particleBudget   - 粒子预算(实际生成数 ≤8000)
 * @property {[number, number]} appearance.palette - [主色hex, 辅色hex]
 * @property {boolean} [appearance.supportsColorCustomization] - 是否支持运行时改色(主星为 true)
 *   若为 true,factory() 返回对象的 userData 上须挂 setColor(primaryHex, secondaryHex) 方法,
 *   供 UI 颜色面板实时调用
 */

/**
 * 校验 PlanetSpec 是否符合契约(静态字段校验,不调用 factory)
 * 用于 PR 合并前 / 装配前的断言
 * @param {PlanetSpec} spec
 * @returns {string[]} errors 数组,空数组表示通过
 */
export function validatePlanetSpec(spec) {
    const errors = [];

    // name
    if (typeof spec.name !== 'string' || spec.name.trim() === '') {
        errors.push('name 必须是非空字符串');
    }

    // type
    if (!Object.values(PlanetType).includes(spec.type)) {
        errors.push(`type 必须是 'star' 或 'planet',当前: ${spec.type}`);
    }

    // factory
    if (typeof spec.factory !== 'function') {
        errors.push('factory 必须是函数');
    }

    // orbit
    if (!spec.orbit || typeof spec.orbit !== 'object') {
        errors.push('orbit 必须是对象');
    } else {
        // 主星轨道固定为 0(不公转)
        if (spec.type === PlanetType.STAR) {
            if (spec.orbit.radius !== 0) errors.push('主星 orbit.radius 必须为 0');
            if (spec.orbit.speed !== 0) errors.push('主星 orbit.speed 必须为 0(不公转)');
        } else {
            const r = spec.orbit.radius;
            if (typeof r !== 'number' || r < BUDGETS.ORBIT_RADIUS_MIN || r > BUDGETS.ORBIT_RADIUS_MAX) {
                errors.push(`orbit.radius 必须在 [${BUDGETS.ORBIT_RADIUS_MIN}, ${BUDGETS.ORBIT_RADIUS_MAX}] 内,当前: ${r}`);
            }
            const s = spec.orbit.speed;
            if (typeof s !== 'number' || s < BUDGETS.ORBIT_SPEED_MIN || s > BUDGETS.ORBIT_SPEED_MAX) {
                errors.push(`orbit.speed 必须在 [${BUDGETS.ORBIT_SPEED_MIN}, ${BUDGETS.ORBIT_SPEED_MAX}] 内,当前: ${s}`);
            }
        }
        const inc = spec.orbit.inclination;
        if (typeof inc !== 'number' || Math.abs(inc) > BUDGETS.INCLINATION_RANGE) {
            errors.push(`orbit.inclination 绝对值不得超过 ${BUDGETS.INCLINATION_RANGE.toFixed(3)}`);
        }
    }

    // appearance
    if (!spec.appearance || typeof spec.appearance !== 'object') {
        errors.push('appearance 必须是对象');
    } else {
        const cr = spec.appearance.coreRadius;
        if (typeof cr !== 'number' || cr < BUDGETS.CORE_RADIUS_MIN || cr > BUDGETS.CORE_RADIUS_MAX) {
            errors.push(`appearance.coreRadius 必须在 [${BUDGETS.CORE_RADIUS_MIN}, ${BUDGETS.CORE_RADIUS_MAX}] 内,当前: ${cr}`);
        }
        const pb = spec.appearance.particleBudget;
        if (typeof pb !== 'number' || pb > BUDGETS.MAX_PARTICLES_PER_PLANET) {
            errors.push(`appearance.particleBudget 不得超过 ${BUDGETS.MAX_PARTICLES_PER_PLANET},当前: ${pb}`);
        }
        if (!Array.isArray(spec.appearance.palette) || spec.appearance.palette.length < 2) {
            errors.push('appearance.palette 必须是 [主色hex, 辅色hex] 两个值');
        }
    }

    return errors;
}

/**
 * 运行时校验:factory() 返回值是否合法
 * 在装配阶段调用 factory() 后立即校验,确保对象真的能进场景
 * 用 isObject3D 标志判断,避免本文件强依赖 three
 * @param {*} obj - factory() 的返回值
 * @returns {string[]} errors
 */
export function validateFactoryOutput(obj) {
    const errors = [];
    if (!obj || obj.isObject3D !== true) {
        errors.push('factory() 必须返回 THREE.Object3D 实例(带 isObject3D=true 标志)');
    }
    return errors;
}

/**
 * 便捷断言:校验失败时抛错(装配阶段用)
 * @param {PlanetSpec} spec
 * @returns {PlanetSpec} spec 本身,便于链式调用
 * @throws {Error} 校验失败时抛出含所有错误的 Error
 */
export function assertValidSpec(spec) {
    const errors = validatePlanetSpec(spec);
    if (errors.length > 0) {
        throw new Error(`[PlanetSpec] ${spec.name || '(unnamed)'} 校验失败:\n  - ${errors.join('\n  - ')}`);
    }
    return spec;
}
