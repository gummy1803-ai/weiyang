// src/planets/planet_phoenixA.js
// 凤凰座 A 星 —— K 型橙巨星 + 恒星风 + 轨道粒子
// 适配自 124-main/凤凰座a星.html，遵循 PlanetSpec 契约
import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js?v=20260902v3';
import { PlanetType, assertValidSpec } from '../PlanetSpec.js?v=20260902v3';

const CONFIG = {
    starRadius: 50,
    chromosphereRadius: 58,
    coronaInnerRadius: 68,
    coronaOuterRadius: 95,
    windRingRadius: 130,
    windParticleCount: 20000,
    orbitParticleCount: 18000,
};

function createStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#cc6622'); grad.addColorStop(0.15, '#dd7733');
    grad.addColorStop(0.35, '#ee8833'); grad.addColorStop(0.55, '#ffaa44');
    grad.addColorStop(0.75, '#ffbb55'); grad.addColorStop(1, '#cc6622');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 200; i++) {
        const x = Math.random()*1024, y = Math.random()*512;
        const rx = Math.random()*40+15, ry = Math.random()*30+10;
        const alpha = Math.random()*0.3+0.1;
        const bright = Math.random()>0.5;
        const cg = ctx.createRadialGradient(x, y, 0, x, y, rx);
        if (bright){cg.addColorStop(0, `rgba(255,220,120,${alpha})`);cg.addColorStop(0.5, `rgba(255,180,80,${alpha*0.5})`);cg.addColorStop(1, 'rgba(255,150,50,0)');}
        else {cg.addColorStop(0, `rgba(180,80,30,${alpha})`);cg.addColorStop(0.5, `rgba(200,100,40,${alpha*0.4})`);cg.addColorStop(1, 'rgba(200,100,40,0)');}
        ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, Math.random()*0.5, 0, Math.PI*2); ctx.fill();
    }
    for (let i = 0; i < 8; i++) {
        const x = Math.random()*1024, y = 80+Math.random()*352;
        const rx = Math.random()*25+15, ry = rx*(0.6+Math.random()*0.4);
        const sg = ctx.createRadialGradient(x, y, 0, x, y, rx*1.5);
        sg.addColorStop(0, 'rgba(40,15,5,0.85)'); sg.addColorStop(0.5, 'rgba(80,35,10,0.5)');
        sg.addColorStop(0.8, 'rgba(120,55,15,0.2)'); sg.addColorStop(1, 'rgba(150,70,20,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x, y, rx*1.5, ry*1.5, 0, 0, Math.PI*2); ctx.fill();
    }
    for (let i = 0; i < 15000; i++) {
        const x = Math.random()*1024, y = Math.random()*512, size = Math.random()*2+0.5;
        const brightness = Math.random()*0.25+0.08, hue = 25+Math.random()*20, sat = 75+Math.random()*25, light = 50+Math.random()*35;
        ctx.fillStyle = `hsla(${hue},${sat}%,${light}%,${brightness})`;
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill();
    }
    for (let i = 0; i < 30; i++) {
        const x = Math.random()*1024, y = Math.random()*512, rx = Math.random()*15+8;
        const fg = ctx.createRadialGradient(x, y, 0, x, y, rx);
        fg.addColorStop(0, 'rgba(255,240,180,0.6)'); fg.addColorStop(0.5, 'rgba(255,200,100,0.3)'); fg.addColorStop(1, 'rgba(255,180,80,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI*2); ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
}

function createWind() {
    const count = CONFIG.windParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { dirs: new Float32Array(count*3), speeds: new Float32Array(count),
        phases: new Float32Array(count), maxDist: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        const dirX = Math.sin(phi)*Math.cos(theta), dirY = Math.sin(phi)*Math.sin(theta), dirZ = Math.cos(phi);
        const r = CONFIG.starRadius+Math.random()*5;
        positions[i*3]=r*dirX; positions[i*3+1]=r*dirY; positions[i*3+2]=r*dirZ;
        data.dirs[i*3]=dirX; data.dirs[i*3+1]=dirY; data.dirs[i*3+2]=dirZ;
        data.speeds[i]=0.15+Math.random()*0.35; data.phases[i]=Math.random()*Math.PI*2;
        data.maxDist[i]=120+Math.random()*180;
        const hueVar = Math.random();
        colors[i*3]=0.9+hueVar*0.1; colors[i*3+1]=0.4+hueVar*0.3; colors[i*3+2]=0.15+hueVar*0.1;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.5, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

function createOrbit() {
    const count = CONFIG.orbitParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const data = { semiMajors: new Float32Array(count), semiMinors: new Float32Array(count),
        inclinations: new Float32Array(count), longitudes: new Float32Array(count),
        baseAngles: new Float32Array(count), speeds: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const a = 160+Math.random()*250, ecc = 0.1+Math.random()*0.4, b = a*(1-ecc);
        const inc = (Math.random()-0.5)*0.6, lon = Math.random()*Math.PI*2, angle = Math.random()*Math.PI*2;
        data.semiMajors[i]=a; data.semiMinors[i]=b; data.inclinations[i]=inc;
        data.longitudes[i]=lon; data.baseAngles[i]=angle; data.speeds[i]=0.08*Math.sqrt(160/a)*0.4;
        const cosA=Math.cos(angle), sinA=Math.sin(angle);
        let x=a*cosA, z=b*sinA, y=0;
        const cosI=Math.cos(inc), sinI=Math.sin(inc);
        const ny=y*cosI-z*sinI, nz=y*sinI+z*cosI; y=ny; z=nz;
        const cosL=Math.cos(lon), sinL=Math.sin(lon);
        const nx=x*cosL-z*sinL, nz2=x*sinL+z*cosL; x=nx; z=nz2;
        positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
        const t=Math.random();
        colors[i*3]=0.8+t*0.2; colors[i*3+1]=0.35+t*0.3; colors[i*3+2]=0.12+t*0.1;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data };
}

export function createPhoenixA() {
    const group = new THREE.Group();
    group.name = 'phoenixA';

    const starSurface = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.starRadius, 64, 64),
        new THREE.MeshBasicMaterial({ map: createStarTexture(), color: 0xffffff })
    );
    group.add(starSurface);

    const chromosphere = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.chromosphereRadius, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.35, side: THREE.BackSide, blending: THREE.AdditiveBlending })
    );
    group.add(chromosphere);

    const coronaInner = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.coronaInnerRadius, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.2, side: THREE.BackSide, blending: THREE.AdditiveBlending })
    );
    group.add(coronaInner);

    const coronaOuter = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.coronaOuterRadius, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0xffcc77, transparent: true, opacity: 0.12, side: THREE.BackSide, blending: THREE.AdditiveBlending })
    );
    group.add(coronaOuter);

    const wind = createWind(); group.add(wind.points);
    const orbit = createOrbit(); group.add(orbit.points);

    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(160, 16, 16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.name = 'phoenixA-click';
    group.add(clickTarget);

    group.userData.tick = (time) => {
        starSurface.rotation.y += 0.003;
        const cp = 1+Math.sin(time*2)*0.015; chromosphere.scale.set(cp,cp,cp); chromosphere.material.opacity = 0.33+Math.sin(time*1.8)*0.04;
        const ci = 1+Math.sin(time*1.5)*0.02; coronaInner.scale.set(ci,ci,ci); coronaInner.material.opacity = 0.18+Math.sin(time*2.2)*0.03;
        const co = 1+Math.sin(time*1.2)*0.025; coronaOuter.scale.set(co,co,co); coronaOuter.material.opacity = 0.1+Math.sin(time*1.5)*0.025;

        if (wind.data) {
            const arr = wind.points.geometry.attributes.position.array;
            const n = wind.data.speeds.length;
            for (let i = 0; i < n; i++) {
                const idx = i*3;
                const phase = (time*wind.data.speeds[i]+wind.data.phases[i])%1.0;
                const dist = CONFIG.starRadius+phase*wind.data.maxDist[i];
                arr[idx]=wind.data.dirs[idx]*dist;
                arr[idx+1]=wind.data.dirs[idx+1]*dist;
                arr[idx+2]=wind.data.dirs[idx+2]*dist;
            }
            wind.points.geometry.attributes.position.needsUpdate = true;
        }
        if (orbit.data) {
            const arr = orbit.points.geometry.attributes.position.array;
            const n = orbit.data.semiMajors.length;
            for (let i = 0; i < n; i++) {
                const ang = orbit.data.baseAngles[i]+time*orbit.data.speeds[i];
                const a=orbit.data.semiMajors[i], b=orbit.data.semiMinors[i], inc=orbit.data.inclinations[i], lon=orbit.data.longitudes[i];
                const cosA=Math.cos(ang), sinA=Math.sin(ang);
                let x=a*cosA, z=b*sinA, y=0;
                const cosI=Math.cos(inc), sinI=Math.sin(inc);
                const ny=y*cosI-z*sinI, nz=y*sinI+z*cosI; y=ny; z=nz;
                const cosL=Math.cos(lon), sinL=Math.sin(lon);
                const nx=x*cosL-z*sinL, nz2=x*sinL+z*cosL; x=nx; z=nz2;
                arr[i*3]=x; arr[i*3+1]=y; arr[i*3+2]=z;
            }
            orbit.points.geometry.attributes.position.needsUpdate = true;
        }
    };

    group.userData.clickTarget = clickTarget;
    return group;
}

export const phoenixASpec = {
    name: 'phoenixA',
    type: PlanetType.PLANET,
    factory: createPhoenixA,
    orbit: { radius: 1450, speed: 0.0008, phase: Math.PI + Math.PI / 2, inclination: 0.15, eccentricity: 0.18, ascendingNode: 2.3 },  // 环5·倾角8.6°(×√2) [内移至小行星带1600以内]
    appearance: { palette: [0xffaa44, 0xff8833, 0xffcc77], supportsColorCustomization: false },
    info: {
        title: '凤凰座 A 星', subtitle: 'Phoenix A · K 型橙巨星',
        rows: [
            { label: '类型', value: 'K 型巨星 (橙巨星)' },
            { label: '位置', value: '凤凰座' },
            { label: '半径', value: '约 50 倍太阳半径' },
            { label: '表面温度', value: '~4,000 K' },
            { label: '特征', value: '色球层 / 日冕 / 恒星风 / 黑子' }
        ],
        description: '凤凰座 A 是一颗 K 型橙巨星，处于恒星演化的晚期阶段。其表面温度约 4000K，呈现温暖的橙色调。恒星表面布满对流胞和黑子，外层的色球层和日冕在恒星风中不断膨胀，向外抛射物质。周围环绕着椭圆轨道运动的尘埃和粒子，记录着这颗巨星生命末期的壮丽景象。'
    }
};

assertValidSpec(phoenixASpec);
