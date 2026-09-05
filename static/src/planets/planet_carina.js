// src/planets/planet_carina.js
// 船底座星云 Carina Nebula (NGC 3372) —— 海山二 + 尘埃柱 + 多色气体
// 适配自 124-main/船底座星云.html，遵循 PlanetSpec 契约
import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js?v=20260902v3';
import { PlanetType, assertValidSpec } from '../PlanetSpec.js?v=20260902v3';

const CONFIG = {
    homunculusLength: 50,
    homunculusRadius: 20,
    clusterStars: [
        { pos: [0, 0, 0], radius: 6, color: 0xffddaa, glowColor: 0xffaa55 },
        { pos: [40, 20, -10], radius: 4, color: 0xddeeff, glowColor: 0xaaccff },
        { pos: [-30, -15, 15], radius: 3.5, color: 0xddeeff, glowColor: 0xaaccff },
    ],
    nebulaRadius: 180,
    pillarCount: 5,
    gasCount: 22000,
    pillarParticles: 15000,
    dustCount: 5000,
    haloCount: 4000,
    tiltX: 0.15,
    tiltZ: -0.05,
};

function noise3D(x, y, z) {
    return Math.sin(x*0.03)*Math.cos(y*0.04)*Math.sin(z*0.035)
         + Math.sin(x*0.08+1)*Math.cos(y*0.07+2)*Math.sin(z*0.06+3)*0.5
         + Math.sin(x*0.15+4)*Math.cos(y*0.13+5)*Math.sin(z*0.11+6)*0.25;
}

function createHomunculus() {
    const count = 6000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count*3), col = new Float32Array(count*3);
    for (let i = 0; i < count; i++) {
        const lobe = Math.random()<0.5?1:-1;
        const t = Math.pow(Math.random(), 0.4);
        const dist = t*CONFIG.homunculusLength;
        const angle = Math.random()*Math.PI*2;
        const radius = CONFIG.homunculusRadius*(0.2+t*0.8);
        const x = Math.cos(angle)*radius, y = lobe*dist, z = Math.sin(angle)*radius*0.6;
        const n = noise3D(x, y, z)*3;
        pos[i*3]=x+n; pos[i*3+1]=y+n*0.5; pos[i*3+2]=z+n*0.5;
        const intensity = (1-t*0.4)*(0.4+Math.random()*0.5);
        col[i*3]=0.8*intensity; col[i*3+1]=0.45*intensity; col[i*3+2]=0.2*intensity;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
}

function createGas() {
    const count = CONFIG.gasCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count), speeds: new Float32Array(count) };
    let i = 0;
    while (i < count) {
        const x = (Math.random()-0.5)*CONFIG.nebulaRadius*2;
        const y = (Math.random()-0.5)*CONFIG.nebulaRadius*1.5;
        const z = (Math.random()-0.5)*CONFIG.nebulaRadius*2;
        const dist = Math.sqrt(x*x+y*y+z*z);
        const distFactor = dist/CONFIG.nebulaRadius;
        if (distFactor>1.0 && Math.random()>(1.0/distFactor)*0.3) continue;
        positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
        data.basePos[i*3]=x; data.basePos[i*3+1]=y; data.basePos[i*3+2]=z;
        data.phases[i]=Math.random()*Math.PI*2; data.speeds[i]=0.06+Math.random()*0.2;
        const nv = noise3D(x*1.5, y*1.5, z*1.5);
        let r, g, b;
        if (nv>0.3){r=0.9+Math.random()*0.1;g=0.15+Math.random()*0.12;b=0.2+Math.random()*0.1;}
        else if (nv>-0.05){r=0.2+Math.random()*0.15;g=0.65+Math.random()*0.2;b=0.4+Math.random()*0.15;}
        else if (nv>-0.3){r=0.2+Math.random()*0.1;g=0.35+Math.random()*0.15;b=0.75+Math.random()*0.2;}
        else {r=0.75+Math.random()*0.15;g=0.35+Math.random()*0.15;b=0.12+Math.random()*0.08;}
        const brightness = (1.0-distFactor*0.5)*(0.35+Math.random()*0.6);
        colors[i*3]=r*brightness; colors[i*3+1]=g*brightness; colors[i*3+2]=b*brightness;
        i++;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createPillars() {
    const total = CONFIG.pillarParticles;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(total*3), colors = new Float32Array(total*3);
    const pPer = Math.floor(total/CONFIG.pillarCount);
    let idx = 0;
    for (let p = 0; p < CONFIG.pillarCount; p++) {
        const px = (Math.random()-0.5)*CONFIG.nebulaRadius*1.2;
        const pz = (Math.random()-0.5)*CONFIG.nebulaRadius*1.2;
        const pyBase = -40+Math.random()*20;
        const pillarHeight = 60+Math.random()*80;
        const pillarWidth = 15+Math.random()*15;
        for (let i = 0; i < pPer && idx < total; i++) {
            const t = Math.random();
            const height = t*pillarHeight;
            const width = pillarWidth*(1-t*0.5);
            const angle = Math.random()*Math.PI*2;
            const r = Math.random()*width;
            const ox = Math.cos(angle)*r, oz = Math.sin(angle)*r;
            const x = px+ox+noise3D(ox, height, oz)*5;
            const y = pyBase+height+noise3D(x, height, oz)*3;
            const z = pz+oz+noise3D(x, height, oz)*5;
            positions[idx*3]=x; positions[idx*3+1]=y; positions[idx*3+2]=z;
            const topFactor = t;
            const brightness = (0.04+topFactor*0.1)*(0.5+Math.random()*0.5);
            if (topFactor>0.85 && Math.random()>0.7){
                colors[idx*3]=brightness*0.8; colors[idx*3+1]=brightness*0.6; colors[idx*3+2]=brightness*0.3;
            } else {
                colors[idx*3]=brightness*(0.6+topFactor*0.3); colors[idx*3+1]=brightness*(0.35+topFactor*0.15); colors[idx*3+2]=brightness*0.15;
            }
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

function createDust() {
    const count = CONFIG.dustCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { basePos: new Float32Array(count*3), phases: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const x = (Math.random()-0.5)*CONFIG.nebulaRadius*0.8;
        const y = (Math.random()-0.5)*CONFIG.nebulaRadius*0.5;
        const z = (Math.random()-0.5)*CONFIG.nebulaRadius*0.8;
        const n = noise3D(x*2, y*2, z*2)*8;
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
        const r = CONFIG.nebulaRadius+Math.random()*100;
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        const x = r*Math.sin(phi)*Math.cos(theta), y = r*Math.cos(phi), z = r*Math.sin(phi)*Math.sin(theta);
        positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
        data.basePos[i*3]=x; data.basePos[i*3+1]=y; data.basePos[i*3+2]=z;
        data.phases[i]=Math.random()*Math.PI*2;
        const brightness = 0.06+Math.random()*0.1, t = Math.random();
        if (t<0.4){colors[i*3]=brightness*0.7;colors[i*3+1]=brightness*0.3;colors[i*3+2]=brightness*0.15;}
        else if (t<0.7){colors[i*3]=brightness*0.2;colors[i*3+1]=brightness*0.5;colors[i*3+2]=brightness*0.7;}
        else {colors[i*3]=brightness*0.2;colors[i*3+1]=brightness*0.55;colors[i*3+2]=brightness*0.35;}
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

export function createCarinaNebula() {
    const group = new THREE.Group();
    group.name = 'carina';
    group.rotation.x = CONFIG.tiltX;
    group.rotation.z = CONFIG.tiltZ;

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

    const homunculus = createHomunculus(); group.add(homunculus);
    const gas = createGas(); group.add(gas.points);
    const pillars = createPillars(); group.add(pillars);
    const dust = createDust(); group.add(dust.points);
    const halo = createHalo(); group.add(halo.points);

    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.nebulaRadius*1.2, 16, 16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.name = 'carina-click';
    group.add(clickTarget);

    group.userData.tick = (time) => {
        clusterGlows.forEach((glow, i) => {
            const phase = i*0.3;
            const pulse = 1+Math.sin(time*2+phase)*0.06;
            glow.scale.set(pulse, pulse, pulse);
            glow.material.opacity = 0.22+Math.sin(time*2.5+phase)*0.06;
        });
        homunculus.rotation.y += 0.0005;

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

export const carinaSpec = {
    name: 'carina',
    type: PlanetType.PLANET,
    factory: createCarinaNebula,
    orbit: { radius: 1100, speed: 0.0014, phase: 2 * Math.PI / 3, inclination: 0.10, eccentricity: 0.20, ascendingNode: 0.8 },  // 环3·倾角5.7°(×√2)
    appearance: { palette: [0xff5566, 0x33aa66, 0x3366cc], supportsColorCustomization: false },
    info: {
        title: '船底座星云', subtitle: 'Carina Nebula (NGC 3372) · 恒星形成区',
        rows: [
            { label: '类型', value: '发射/反射星云 / 恒星诞生区' },
            { label: '距离', value: '~8,500 光年（船底座）' },
            { label: '直径', value: '~300 光年' },
            { label: '中心', value: '海山二 (Eta Carinae)' },
            { label: '特征', value: 'Homunculus 双极星云 / 神秘山 / 钥匙孔星云' }
        ],
        description: '船底座星云是南天最壮观的恒星形成区，比猎户座星云大四倍。中心的海山二是一颗质量约为太阳 100 倍的高光度蓝变星，1840 年曾发生大爆发，抛出了著名的 Homunculus（侏儒）双极星云。星云中散布着"神秘山"般的尘埃柱，顶部正在被强烈紫外辐射雕刻。'
    }
};

assertValidSpec(carinaSpec);
