// src/planets/planet_rosette.js
// 玫瑰星云 Rosette Nebula (NGC 2237) —— HII 发射星云 + 中心星团
// 适配自 124-main/玫瑰星云.html，遵循 PlanetSpec 契约
import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js?v=20260902v3';
import { PlanetType, assertValidSpec } from '../PlanetSpec.js?v=20260902v3';

const CONFIG = {
    clusterStars: [
        { pos: [0, 0, 0], radius: 4.5, color: 0xddeeff, glowColor: 0xaaccff },
        { pos: [14, 5, -4], radius: 5, color: 0xddeeff, glowColor: 0xaaccff },
        { pos: [-10, -3, 5], radius: 4, color: 0xaaccff, glowColor: 0x88aaff },
        { pos: [6, -8, 8], radius: 3.5, color: 0xffeecc, glowColor: 0xffccaa },
    ],
    shellInner: 50,
    shellMain: 90,
    shellOuter: 130,
    shellThickness: 50,
    petalCount: 8,
    gasParticleCount: 35000,
    dustParticleCount: 8000,
    haloParticleCount: 5000,
    tiltX: 0.15,
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
    const data = { baseR: new Float32Array(count), baseTheta: new Float32Array(count),
        basePhi: new Float32Array(count), phases: new Float32Array(count), speeds: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        let r; const rand = Math.random();
        if (rand<0.7) r = CONFIG.shellMain+(Math.random()-0.5)*CONFIG.shellThickness*1.5;
        else if (rand<0.9) r = CONFIG.shellOuter-20+Math.random()*40;
        else r = CONFIG.shellInner+Math.random()*25;
        const theta = Math.random()*Math.PI*2;
        const phi = Math.PI/2+(Math.random()-0.5)*0.7*Math.PI;
        const petalAngle = (theta*CONFIG.petalCount)%(Math.PI*2);
        const petalBoost = 1+Math.cos(petalAngle)*0.3;
        const finalR = r*petalBoost;
        const baseX = finalR*Math.sin(phi)*Math.cos(theta);
        const baseY = finalR*Math.cos(phi)*0.8;
        const baseZ = finalR*Math.sin(phi)*Math.sin(theta);
        const n = noise3D(baseX, baseY, baseZ)*10;
        positions[i*3]=baseX+n*0.3; positions[i*3+1]=baseY+n*0.2; positions[i*3+2]=baseZ+n*0.3;
        data.baseR[i]=finalR; data.baseTheta[i]=theta; data.basePhi[i]=phi;
        data.phases[i]=Math.random()*Math.PI*2; data.speeds[i]=0.08+Math.random()*0.25;
        const distFactor = (finalR-CONFIG.shellInner)/(CONFIG.shellOuter-CONFIG.shellInner);
        const clampedT = Math.max(0, Math.min(1, distFactor));
        const noiseCol = noise3D(baseX*2, baseY*2, baseZ*2);
        let rc, gc, bc;
        if (noiseCol>0.25 && clampedT>0.3){rc=0.2+Math.random()*0.15;gc=0.55+Math.random()*0.2;bc=0.7+Math.random()*0.2;}
        else if (noiseCol>-0.2){rc=0.85+Math.random()*0.15;gc=0.15+Math.random()*0.12;bc=0.2+Math.random()*0.1;}
        else {rc=0.6+Math.random()*0.2;gc=0.1+Math.random()*0.08;bc=0.12+Math.random()*0.08;}
        const cavityFactor = finalR<CONFIG.shellInner?0.3:1.0;
        const brightness = (1.0-clampedT*0.4)*(0.4+Math.random()*0.6)*cavityFactor;
        colors[i*3]=rc*brightness; colors[i*3+1]=gc*brightness; colors[i*3+2]=bc*brightness;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createDust() {
    const count = CONFIG.dustParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { baseR: new Float32Array(count), baseTheta: new Float32Array(count),
        basePhi: new Float32Array(count), phases: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const r = CONFIG.shellMain+(Math.random()-0.5)*CONFIG.shellThickness*1.2;
        const theta = Math.random()*Math.PI*2;
        const phi = Math.PI/2+(Math.random()-0.5)*0.5*Math.PI;
        const x = r*Math.sin(phi)*Math.cos(theta), y = r*Math.cos(phi)*0.8, z = r*Math.sin(phi)*Math.sin(theta);
        const n = noise3D(x, y, z)*8;
        positions[i*3]=x+n*0.3; positions[i*3+1]=y+n*0.2; positions[i*3+2]=z+n*0.3;
        data.baseR[i]=r; data.baseTheta[i]=theta; data.basePhi[i]=phi; data.phases[i]=Math.random()*Math.PI*2;
        const brightness = 0.05+Math.random()*0.12;
        colors[i*3]=brightness*0.5; colors[i*3+1]=brightness*0.3; colors[i*3+2]=brightness*0.2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.5, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createHalo() {
    const count = CONFIG.haloParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { baseR: new Float32Array(count), baseTheta: new Float32Array(count),
        basePhi: new Float32Array(count), phases: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const r = CONFIG.shellOuter+Math.random()*80;
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        positions[i*3]=r*Math.sin(phi)*Math.cos(theta); positions[i*3+1]=r*Math.cos(phi)*0.8; positions[i*3+2]=r*Math.sin(phi)*Math.sin(theta);
        data.baseR[i]=r; data.baseTheta[i]=theta; data.basePhi[i]=phi; data.phases[i]=Math.random()*Math.PI*2;
        const brightness = 0.08+Math.random()*0.12;
        colors[i*3]=brightness*0.7; colors[i*3+1]=brightness*0.25; colors[i*3+2]=brightness*0.2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

export function createRosetteNebula() {
    const group = new THREE.Group();
    group.name = 'rosette';
    group.rotation.x = CONFIG.tiltX;

    const clusterGlows = [];
    CONFIG.clusterStars.forEach(starDef => {
        const star = new THREE.Mesh(
            new THREE.SphereGeometry(starDef.radius, 16, 16),
            new THREE.MeshBasicMaterial({ color: starDef.color })
        );
        star.position.set(...starDef.pos);
        group.add(star);
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(starDef.radius*5, 16, 16),
            new THREE.MeshBasicMaterial({ color: starDef.glowColor, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, side: THREE.BackSide })
        );
        glow.position.copy(star.position);
        group.add(glow);
        clusterGlows.push(glow);
    });

    const gas = createGas(); group.add(gas.points);
    const dust = createDust(); group.add(dust.points);
    const halo = createHalo(); group.add(halo.points);

    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.shellOuter*1.2, 16, 16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.name = 'rosette-click';
    group.add(clickTarget);

    group.userData.tick = (time) => {
        clusterGlows.forEach((glow, i) => {
            const phase = i*0.4;
            const pulse = 1+Math.sin(time*2+phase)*0.06;
            glow.scale.set(pulse, pulse, pulse);
            glow.material.opacity = 0.22+Math.sin(time*2.5+phase)*0.06;
        });

        if (gas.data) {
            const arr = gas.points.geometry.attributes.position.array;
            const n = gas.data.baseR.length;
            for (let i = 0; i < n; i++) {
                const r = gas.data.baseR[i]+Math.sin(time*gas.data.speeds[i]+gas.data.phases[i])*2;
                const theta = gas.data.baseTheta[i]+time*0.003;
                const phi = gas.data.basePhi[i];
                arr[i*3]=r*Math.sin(phi)*Math.cos(theta);
                arr[i*3+1]=r*Math.cos(phi)*0.8;
                arr[i*3+2]=r*Math.sin(phi)*Math.sin(theta);
            }
            gas.points.geometry.attributes.position.needsUpdate = true;
        }
        if (dust.data) {
            const arr = dust.points.geometry.attributes.position.array;
            const n = dust.data.baseR.length;
            for (let i = 0; i < n; i++) {
                const r = dust.data.baseR[i]+Math.sin(time*0.2+dust.data.phases[i])*1.5;
                const theta = dust.data.baseTheta[i]+time*0.003;
                const phi = dust.data.basePhi[i];
                arr[i*3]=r*Math.sin(phi)*Math.cos(theta);
                arr[i*3+1]=r*Math.cos(phi)*0.8;
                arr[i*3+2]=r*Math.sin(phi)*Math.sin(theta);
            }
            dust.points.geometry.attributes.position.needsUpdate = true;
        }
        if (halo.data) {
            const arr = halo.points.geometry.attributes.position.array;
            const n = halo.data.baseR.length;
            for (let i = 0; i < n; i++) {
                const r = halo.data.baseR[i]+Math.sin(time*0.1+halo.data.phases[i])*2;
                const theta = halo.data.baseTheta[i]+time*0.002;
                const phi = halo.data.basePhi[i];
                arr[i*3]=r*Math.sin(phi)*Math.cos(theta);
                arr[i*3+1]=r*Math.cos(phi)*0.8;
                arr[i*3+2]=r*Math.sin(phi)*Math.sin(theta);
            }
            halo.points.geometry.attributes.position.needsUpdate = true;
        }

        group.rotation.y += 0.0003;
    };

    group.userData.clickTarget = clickTarget;
    return group;
}

export const rosetteSpec = {
    name: 'rosette',
    type: PlanetType.PLANET,
    factory: createRosetteNebula,
    orbit: { radius: 650, speed: 0.0015, phase: Math.PI + Math.PI / 3, inclination: 0.15, eccentricity: 0.25, ascendingNode: 3.5 },  // 环2·倾角8.6°
    appearance: { palette: [0xff5577, 0x3388aa, 0xffaa55], supportsColorCustomization: false },
    info: {
        title: '玫瑰星云', subtitle: 'Rosette Nebula (NGC 2237) · HII 发射星云',
        rows: [
            { label: '类型', value: '发射星云 / HII 区' },
            { label: '距离', value: '~5,000 光年（麒麟座）' },
            { label: '直径', value: '~130 光年' },
            { label: '年龄', value: '~500 万年' },
            { label: '中心', value: 'NGC 2244 星团' }
        ],
        description: '玫瑰星云是一个巨大的 HII 区，因形似玫瑰花瓣而得名。中心的 NGC 2244 星团由大质量年轻恒星组成，其强烈的恒星风在星云中心吹出了一个直径约 50 光年的空腔。星云主要由电离氢（Hα 红色）组成，混合着氧和硫的发射线，呈现出梦幻的玫瑰红与蓝绿色交织的色彩。'
    }
};

assertValidSpec(rosetteSpec);
