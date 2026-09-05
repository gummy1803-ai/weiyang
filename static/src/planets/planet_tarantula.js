// src/planets/planet_tarantula.js
// 蜘蛛星云 Tarantula Nebula (30 Doradus) —— R136 星团 + 蜘蛛腿丝状结构
// 适配自 124-main/蜘蛛星云.html，遵循 PlanetSpec 契约
import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js?v=20260902v3';
import { PlanetType, assertValidSpec } from '../PlanetSpec.js?v=20260902v3';

const CONFIG = {
    r136Stars: [
        { pos: [0, 0, 0], radius: 7, color: 0xddeeff, glowColor: 0xaaccff },
        { pos: [12, 5, -3], radius: 5, color: 0xddeeff, glowColor: 0xaaccff },
        { pos: [-8, -4, 6], radius: 4.5, color: 0xaaccff, glowColor: 0x88aaff },
        { pos: [7, -7, 8], radius: 4, color: 0xddeeff, glowColor: 0xaaccff },
    ],
    coreRadius: 40, legRadius: 200,
    spiderLegs: 8, legParticles: 2000,
    gasCount: 25000, dustCount: 5000, haloCount: 3500,
    tiltX: 0.15, tiltZ: -0.08,
};

function noise3D(x, y, z) {
    return Math.sin(x*0.03)*Math.cos(y*0.04)*Math.sin(z*0.035)
         + Math.sin(x*0.08+1)*Math.cos(y*0.07+2)*Math.sin(z*0.06+3)*0.5
         + Math.sin(x*0.15+4)*Math.cos(y*0.13+5)*Math.sin(z*0.11+6)*0.25;
}

function createSpiderLegs() {
    const total = CONFIG.spiderLegs * CONFIG.legParticles;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(total*3), colors = new Float32Array(total*3);
    let idx = 0;
    for (let l = 0; l < CONFIG.spiderLegs; l++) {
        const angle = (l/CONFIG.spiderLegs)*Math.PI*2 + Math.random()*0.3;
        const legLen = CONFIG.legRadius*(0.7+Math.random()*0.4);
        const legWidth = 6+Math.random()*8;
        const bend1=(Math.random()-0.5)*60, bend2=(Math.random()-0.5)*40, bend3=(Math.random()-0.5)*30;
        const dirX=Math.cos(angle), dirY=0, dirZ=Math.sin(angle);
        const perpX=-dirZ, perpZ=dirX;
        for (let i = 0; i < CONFIG.legParticles; i++) {
            const t = Math.random();
            const dist = t*legLen;
            const bend = Math.sin(t*3)*bend1 + Math.sin(t*5)*bend2;
            const vertOffset = Math.sin(t*2)*bend3;
            const spread = legWidth*(0.5+t*0.8);
            const x = dirX*dist + perpX*bend + (Math.random()-0.5)*spread;
            const y = vertOffset + (Math.random()-0.5)*spread*0.8;
            const z = dirZ*bend + perpZ*bend + (Math.random()-0.5)*spread;
            positions[idx*3]=x; positions[idx*3+1]=y; positions[idx*3+2]=z;
            let rc, gc, bc;
            if (t<0.3){rc=0.85+Math.random()*0.15;gc=0.12+Math.random()*0.1;bc=0.18+Math.random()*0.08;}
            else if (t<0.65){rc=0.6+Math.random()*0.2;gc=0.25+Math.random()*0.15;bc=0.2+Math.random()*0.1;}
            else {rc=0.15+Math.random()*0.12;gc=0.5+Math.random()*0.2;bc=0.65+Math.random()*0.2;}
            const intensity = Math.sin(Math.min(t,1-t)*Math.PI*1.5)*(0.4+Math.random()*0.5);
            colors[idx*3]=rc*intensity; colors[idx*3+1]=gc*intensity; colors[idx*3+2]=bc*intensity;
            idx++;
        }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
}

function createGas() {
    const count = CONFIG.gasCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count), speeds: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const r = CONFIG.coreRadius*1.5 + Math.pow(Math.random(), 0.5)*CONFIG.legRadius;
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        let x = r*Math.sin(phi)*Math.cos(theta), y = r*Math.cos(phi)*0.8, z = r*Math.sin(phi)*Math.sin(theta);
        const n = noise3D(x, y, z)*15;
        x += n*0.3; y += n*0.2; z += n*0.3;
        positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
        data.basePos[i*3]=x; data.basePos[i*3+1]=y; data.basePos[i*3+2]=z;
        data.phases[i]=Math.random()*Math.PI*2; data.speeds[i]=0.06+Math.random()*0.2;
        const distFactor = r/CONFIG.legRadius;
        const nv = noise3D(x*1.5, y*1.5, z*1.5);
        let rc, gc, bc;
        if (distFactor<0.3){rc=0.5+Math.random()*0.2;gc=0.7+Math.random()*0.2;bc=0.9+Math.random()*0.1;}
        else if (nv>0.3){rc=0.88+Math.random()*0.12;gc=0.12+Math.random()*0.1;bc=0.18+Math.random()*0.08;}
        else if (nv>-0.05){rc=0.15+Math.random()*0.12;gc=0.55+Math.random()*0.2;bc=0.5+Math.random()*0.15;}
        else if (nv>-0.3){rc=0.15+Math.random()*0.1;gc=0.3+Math.random()*0.15;bc=0.7+Math.random()*0.2;}
        else {rc=0.6+Math.random()*0.15;gc=0.08+Math.random()*0.06;bc=0.1+Math.random()*0.06;}
        const brightness = (1.0-distFactor*0.4)*(0.3+Math.random()*0.6);
        colors[i*3]=rc*brightness; colors[i*3+1]=gc*brightness; colors[i*3+2]=bc*brightness;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createDust() {
    const count = CONFIG.dustCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const r = CONFIG.coreRadius+Math.random()*CONFIG.legRadius*0.8;
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        const x = r*Math.sin(phi)*Math.cos(theta), y = r*Math.cos(phi)*0.8, z = r*Math.sin(phi)*Math.sin(theta);
        const n = noise3D(x, y, z)*10;
        positions[i*3]=x+n; positions[i*3+1]=y+n*0.5; positions[i*3+2]=z+n;
        data.basePos[i*3]=positions[i*3]; data.basePos[i*3+1]=positions[i*3+1]; data.basePos[i*3+2]=positions[i*3+2];
        data.phases[i]=Math.random()*Math.PI*2;
        const brightness = 0.04+Math.random()*0.08;
        colors[i*3]=brightness*0.5; colors[i*3+1]=brightness*0.3; colors[i*3+2]=brightness*0.15;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.5, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createHalo() {
    const count = CONFIG.haloCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const r = CONFIG.legRadius+Math.random()*100;
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        const x = r*Math.sin(phi)*Math.cos(theta), y = r*Math.cos(phi)*0.8, z = r*Math.sin(phi)*Math.sin(theta);
        positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
        data.basePos[i*3]=x; data.basePos[i*3+1]=y; data.basePos[i*3+2]=z;
        data.phases[i]=Math.random()*Math.PI*2;
        const brightness = 0.06+Math.random()*0.1;
        colors[i*3]=brightness*0.2; colors[i*3+1]=brightness*0.3; colors[i*3+2]=brightness*0.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

// 4 颗 R136 恒星合并为单个 Mesh(顶点色区分各自颜色),节省 renderables 预算
function createMergedStars() {
    const geos = [], colorArrs = [];
    CONFIG.r136Stars.forEach(def => {
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

export function createTarantulaNebula() {
    const group = new THREE.Group();
    group.name = 'tarantula';
    group.rotation.x = CONFIG.tiltX;
    group.rotation.z = CONFIG.tiltZ;

    const clusterGlows = [];
    group.add(createMergedStars());
    CONFIG.r136Stars.forEach(starDef => {
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(starDef.radius*5, 16, 16),
            new THREE.MeshBasicMaterial({ color: starDef.glowColor, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, side: THREE.BackSide })
        );
        glow.position.set(...starDef.pos);
        group.add(glow);
        clusterGlows.push(glow);
    });

    const legs = createSpiderLegs(); group.add(legs);
    const gas = createGas(); group.add(gas.points);
    const dust = createDust(); group.add(dust.points);
    const halo = createHalo(); group.add(halo.points);

    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.legRadius*1.1, 16, 16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.name = 'tarantula-click';
    group.add(clickTarget);

    group.userData.tick = (time) => {
        clusterGlows.forEach((glow, i) => {
            const phase = i*0.3;
            const pulse = 1+Math.sin(time*2+phase)*0.06;
            glow.scale.set(pulse, pulse, pulse);
            glow.material.opacity = 0.25+Math.sin(time*2.5+phase)*0.06;
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
                arr[i*3]=bx+Math.sin(time*0.15+ph)*1.5;
                arr[i*3+1]=by+Math.cos(time*0.12+ph)*1;
                arr[i*3+2]=bz+Math.sin(time*0.18+ph)*1.2;
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

export const tarantulaSpec = {
    name: 'tarantula',
    type: PlanetType.PLANET,
    factory: createTarantulaNebula,
    orbit: { radius: 2000, speed: 0.0007, phase: Math.PI / 6 },  // 环4·30°
    appearance: { palette: [0xff3355, 0x44bb99, 0x3377cc], supportsColorCustomization: false },
    info: {
        title: '蜘蛛星云', subtitle: 'Tarantula Nebula (30 Doradus) · 恒星诞生巨厂',
        rows: [
            { label: '类型', value: '发射星云 / HII 区' },
            { label: '距离', value: '~160,000 光年（大麦哲伦星系）' },
            { label: '直径', value: '~1,000 光年' },
            { label: '中心', value: 'R136 超星团' },
            { label: '特征', value: '蜘蛛腿丝状结构 / 大质量恒星摇篮' }
        ],
        description: '蜘蛛星云（30 Doradus）是本星系群中最大、最亮的恒星形成区，位于大麦哲伦星系中。其中心的 R136 超星团包含大量大质量恒星，其中 R136a1 是已知质量最大的恒星之一（约 315 倍太阳质量）。星云呈蜘蛛腿状的丝状结构，从中心向外延伸，是宇宙中最壮观的恒星诞生摇篮。'
    }
};

assertValidSpec(tarantulaSpec);
