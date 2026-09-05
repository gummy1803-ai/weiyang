// src/planets/planet_orion.js
// 猎户星云 Orion Nebula (M42) —— 四边形星团 + 气体 + 原行星盘
// 适配自 124-main/猎户星云.html，遵循 PlanetSpec 契约
import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js?v=20260902v3';
import { PlanetType, assertValidSpec } from '../PlanetSpec.js?v=20260902v3';

const CONFIG = {
    trapeziumStars: [
        { pos: [0, 0, 0], radius: 4, color: 0xaaccff, glowColor: 0x88aaff },
        { pos: [12, 3, -5], radius: 5, color: 0xddeeff, glowColor: 0xaaccff },
        { pos: [-8, -4, 6], radius: 4.5, color: 0xaaccff, glowColor: 0x88aaff },
        { pos: [5, -6, -8], radius: 3.5, color: 0xffeecc, glowColor: 0xffcc88 },
    ],
    gasParticleCount: 30000,
    dustParticleCount: 8000,
    proplydCount: 30,
    proplydParticles: 2500,
    haloParticleCount: 5000,
    coreRadius: 120,
    tiltX: 0.2, tiltZ: 0.1,
};

function noise3D(x, y, z) {
    return Math.sin(x*0.03)*Math.cos(y*0.04)*Math.sin(z*0.035)
         + Math.sin(x*0.08+1)*Math.cos(y*0.07+2)*Math.sin(z*0.06+3)*0.5
         + Math.sin(x*0.15+4)*Math.cos(y*0.13+5)*Math.sin(z*0.11+6)*0.25;
}

function createGas() {
    const count = CONFIG.gasParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count), speeds: new Float32Array(count) };
    let i = 0;
    while (i < count) {
        const x = (Math.random()-0.5)*CONFIG.coreRadius*2;
        const y = (Math.random()-0.5)*CONFIG.coreRadius*1.5;
        const z = (Math.random()-0.5)*CONFIG.coreRadius*2;
        const dist = Math.sqrt(x*x+y*y+z*z);
        const distFactor = dist/CONFIG.coreRadius;
        if (distFactor>1.0 && Math.random()>(1.0/distFactor)*0.3) continue;
        positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
        data.basePos[i*3]=x; data.basePos[i*3+1]=y; data.basePos[i*3+2]=z;
        data.phases[i]=Math.random()*Math.PI*2; data.speeds[i]=0.1+Math.random()*0.3;
        const nv = noise3D(x*1.5, y*1.5, z*1.5);
        let r, g, b;
        if (nv>0.3){r=0.9+Math.random()*0.1;g=0.15+Math.random()*0.15;b=0.2+Math.random()*0.15;}
        else if (nv>-0.1){r=0.2+Math.random()*0.15;g=0.7+Math.random()*0.2;b=0.4+Math.random()*0.15;}
        else {r=0.2+Math.random()*0.1;g=0.35+Math.random()*0.15;b=0.7+Math.random()*0.2;}
        const brightness = (1.0-distFactor*0.6)*(0.5+Math.random()*0.6);
        colors[i*3]=r*brightness; colors[i*3+1]=g*brightness; colors[i*3+2]=b*brightness;
        i++;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createDust() {
    const count = CONFIG.dustParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const bandY = -20+(Math.random()-0.5)*25;
        const bandX = (Math.random()-0.5)*CONFIG.coreRadius*1.5;
        const bandZ = (Math.random()-0.5)*CONFIG.coreRadius*1.2;
        const n = noise3D(bandX*2, bandY*2, bandZ*2)*20;
        const x = bandX+n*0.5, y = bandY+n*0.3, z = bandZ+n*0.5;
        positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
        data.basePos[i*3]=x; data.basePos[i*3+1]=y; data.basePos[i*3+2]=z;
        data.phases[i]=Math.random()*Math.PI*2;
        const brightness = 0.05+Math.random()*0.1;
        colors[i*3]=brightness*0.5; colors[i*3+1]=brightness*0.35; colors[i*3+2]=brightness*0.2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.5, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createProplyds() {
    const total = CONFIG.proplydCount * 90;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(total*3), colors = new Float32Array(total*3);
    let idx = 0;
    for (let i = 0; i < CONFIG.proplydCount; i++) {
        let x, y, z, density;
        do {
            x = (Math.random()-0.5)*CONFIG.coreRadius*1.5;
            y = (Math.random()-0.5)*CONFIG.coreRadius;
            z = (Math.random()-0.5)*CONFIG.coreRadius*1.5;
            density = noise3D(x, y, z);
        } while (density < 0);
        const starSize = 0.8+Math.random()*0.6;
        const diskTilt = Math.random()*Math.PI, diskTilt2 = Math.random()*Math.PI;
        const cosT=Math.cos(diskTilt), sinT=Math.sin(diskTilt);
        const cosT2=Math.cos(diskTilt2), sinT2=Math.sin(diskTilt2);
        // 中心恒星点（亮）
        positions[idx*3]=x; positions[idx*3+1]=y; positions[idx*3+2]=z;
        colors[idx*3]=1; colors[idx*3+1]=0.95; colors[idx*3+2]=0.7;
        idx++;
        // 辉光点（多个稍亮粒子模拟 glow）
        for (let g = 0; g < 8; g++) {
            const ga = Math.random()*Math.PI*2, gr = starSize*2+Math.random()*starSize;
            positions[idx*3]=x+Math.cos(ga)*gr; positions[idx*3+1]=y+Math.sin(ga)*gr*0.5; positions[idx*3+2]=z+Math.sin(ga)*gr*0.5;
            colors[idx*3]=0.6; colors[idx*3+1]=0.5; colors[idx*3+2]=0.3;
            idx++;
        }
        // 尘埃盘
        for (let p = 0; p < 80; p++) {
            const r = starSize*1.5+Math.random()*starSize*4;
            const a = Math.random()*Math.PI*2;
            let dx = r*Math.cos(a), dy = 0, dz = r*Math.sin(a)*0.3;
            const ny = dy*cosT-dz*sinT, nz = dy*sinT+dz*cosT; dy = ny; dz = nz;
            const nx = dx*cosT2-dz*sinT2, nz2 = dx*sinT2+dz*cosT2; dx = nx; dz = nz2;
            positions[idx*3]=x+dx; positions[idx*3+1]=y+dy; positions[idx*3+2]=z+dz;
            const b = 0.15+Math.random()*0.15;
            colors[idx*3]=b*0.6; colors[idx*3+1]=b*0.5; colors[idx*3+2]=b*0.3;
            idx++;
        }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
        size: 1.5, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
}

function createHalo() {
    const count = CONFIG.haloParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const r = CONFIG.coreRadius+Math.random()*150;
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        const x = r*Math.sin(phi)*Math.cos(theta), y = r*Math.cos(phi)*0.7, z = r*Math.sin(phi)*Math.sin(theta);
        positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
        data.basePos[i*3]=x; data.basePos[i*3+1]=y; data.basePos[i*3+2]=z;
        data.phases[i]=Math.random()*Math.PI*2;
        const brightness = 0.1+Math.random()*0.15;
        colors[i*3]=brightness*0.8; colors[i*3+1]=brightness*0.4; colors[i*3+2]=brightness*0.25;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

// 4 颗猎户四边形恒星合并为单个 Mesh(顶点色区分各自颜色),节省 renderables 预算
function createMergedStars() {
    const geos = [], colorArrs = [];
    CONFIG.trapeziumStars.forEach(def => {
        const g = new THREE.SphereGeometry(def.radius, 16, 16);
        g.translate(...def.pos);
        geos.push(g);
        const c = new THREE.Color(def.color);
        const arr = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < g.attributes.position.count; i++) { arr[i*3] = c.r; arr[i*3+1] = c.g; arr[i*3+2] = c.b; }
        colorArrs.push(arr);
    });
    let vTotal = 0, iTotal = 0;
    geos.forEach(g => { vTotal += g.attributes.position.count; iTotal += g.index.count; });
    const positions = new Float32Array(vTotal*3), colAttr = new Float32Array(vTotal*3);
    const indices = new Uint16Array(iTotal);
    let vOff = 0, iOff = 0;
    geos.forEach((g, gi) => {
        positions.set(g.attributes.position.array, vOff*3);
        colAttr.set(colorArrs[gi], vOff*3);
        const idx = g.index.array;
        for (let i = 0; i < idx.length; i++) indices[iOff+i] = idx[i]+vOff;
        iOff += idx.length; vOff += g.attributes.position.count;
    });
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('color', new THREE.BufferAttribute(colAttr, 3));
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
    return new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true }));
}

export function createOrionNebula() {
    const group = new THREE.Group();
    group.name = 'orion';
    group.rotation.x = CONFIG.tiltX;
    group.rotation.z = CONFIG.tiltZ;

    const trapeziumGlows = [];
    group.add(createMergedStars());
    CONFIG.trapeziumStars.forEach(starDef => {
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(starDef.radius*5, 16, 16),
            new THREE.MeshBasicMaterial({ color: starDef.glowColor, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, side: THREE.BackSide })
        );
        glow.position.set(...starDef.pos);
        group.add(glow);
        trapeziumGlows.push(glow);
    });

    const gas = createGas(); group.add(gas.points);
    const dust = createDust(); group.add(dust.points);
    const proplyds = createProplyds(); group.add(proplyds);
    const halo = createHalo(); group.add(halo.points);

    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.coreRadius*1.2, 16, 16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.name = 'orion-click';
    group.add(clickTarget);

    group.userData.tick = (time) => {
        trapeziumGlows.forEach((glow, i) => {
            const phase = i*0.3;
            const pulse = 1+Math.sin(time*2+phase)*0.06;
            glow.scale.set(pulse, pulse, pulse);
            glow.material.opacity = 0.18+Math.sin(time*2.5+phase)*0.05;
        });
        if (gas.data) {
            const arr = gas.points.geometry.attributes.position.array;
            const n = gas.data.basePos.length/3;
            for (let i = 0; i < n; i++) {
                const bx=gas.data.basePos[i*3], by=gas.data.basePos[i*3+1], bz=gas.data.basePos[i*3+2];
                const ph=gas.data.phases[i], sp=gas.data.speeds[i];
                arr[i*3]=bx+Math.sin(time*sp+ph)*2.5;
                arr[i*3+1]=by+Math.cos(time*sp*0.7+ph)*2;
                arr[i*3+2]=bz+Math.sin(time*sp*0.5+ph)*2;
            }
            gas.points.geometry.attributes.position.needsUpdate = true;
        }
        if (dust.data) {
            const arr = dust.points.geometry.attributes.position.array;
            const n = dust.data.basePos.length/3;
            for (let i = 0; i < n; i++) {
                const bx=dust.data.basePos[i*3], by=dust.data.basePos[i*3+1], bz=dust.data.basePos[i*3+2], ph=dust.data.phases[i];
                arr[i*3]=bx+Math.sin(time*0.1+ph)*1.5;
                arr[i*3+1]=by+Math.cos(time*0.08+ph)*1;
                arr[i*3+2]=bz+Math.sin(time*0.12+ph)*1.2;
            }
            dust.points.geometry.attributes.position.needsUpdate = true;
        }
        if (halo.data) {
            const arr = halo.points.geometry.attributes.position.array;
            const n = halo.data.basePos.length/3;
            for (let i = 0; i < n; i++) {
                const bx=halo.data.basePos[i*3], by=halo.data.basePos[i*3+1], bz=halo.data.basePos[i*3+2], ph=halo.data.phases[i];
                arr[i*3]=bx+Math.sin(time*0.08+ph)*2;
                arr[i*3+1]=by+Math.cos(time*0.07+ph)*1.5;
                arr[i*3+2]=bz+Math.sin(time*0.09+ph)*2;
            }
            halo.points.geometry.attributes.position.needsUpdate = true;
        }
        group.rotation.y += 0.0003;
    };

    group.userData.clickTarget = clickTarget;
    return group;
}

export const orionSpec = {
    name: 'orion',
    type: PlanetType.PLANET,
    factory: createOrionNebula,
    orbit: { radius: 1450, speed: 0.0010, phase: Math.PI + Math.PI / 6, inclination: 0.12, eccentricity: 0.22, ascendingNode: 4.0 },  // 环4·倾角6.9°(×√2)
    appearance: { palette: [0xff4466, 0x44cc77, 0x4488cc], supportsColorCustomization: false },
    info: {
        title: '猎户星云', subtitle: 'Orion Nebula (M42) · 恒星诞生区',
        rows: [
            { label: '类型', value: '发射/反射星云 / HII 区' },
            { label: '距离', value: '~1,344 光年（猎户座）' },
            { label: '直径', value: '~24 光年' },
            { label: '中心', value: '猎户四边形星团' },
            { label: '特征', value: '原行星盘 (Proplyds) / 鱼嘴暗带' }
        ],
        description: '猎户星云是夜空中最明亮的弥漫星云之一，肉眼可见。其中心的猎户四边形星团由四颗大质量年轻恒星组成，强烈的紫外辐射电离了周围的氢云，使其发出红色的 Hα 辉光。星云中已发现超过 700 个原行星盘（Proplyds）——正在形成中的行星系统，是研究恒星和行星诞生的最佳实验室。'
    }
};

assertValidSpec(orionSpec);
