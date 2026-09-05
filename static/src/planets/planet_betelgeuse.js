// src/planets/planet_betelgeuse.js
// 参宿四 Betelgeuse —— 红超巨星
// 适配自 124-main/参宿四.html，遵循 PlanetSpec 契约
import * as THREE from 'three';
import { particleTexture } from '../particleTexture.js?v=20260902v3';
import { PlanetType, assertValidSpec } from '../PlanetSpec.js?v=20260902v3';

const CONFIG = {
    starRadius: 55,
    chromosphereRadius: 65,
    coronaInnerRadius: 78,
    coronaOuterRadius: 110,
    windParticleCount: 15000,
    orbitParticleCount: 15000,
    bowShockCount: 8000,
};

function createStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#992211'); grad.addColorStop(0.12, '#bb3311');
    grad.addColorStop(0.3, '#cc4422'); grad.addColorStop(0.5, '#dd5533');
    grad.addColorStop(0.7, '#cc4422'); grad.addColorStop(0.88, '#bb3311');
    grad.addColorStop(1, '#992211');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 80; i++) {
        const x = Math.random() * 1024, y = Math.random() * 512;
        const rx = Math.random() * 70 + 30, ry = Math.random() * 50 + 25;
        const alpha = Math.random() * 0.35 + 0.1;
        const bright = Math.random() > 0.45;
        const cellGrad = ctx.createRadialGradient(x, y, 0, x, y, rx);
        if (bright) {
            cellGrad.addColorStop(0, `rgba(255,150,80,${alpha})`);
            cellGrad.addColorStop(0.5, `rgba(220,110,50,${alpha*0.5})`);
            cellGrad.addColorStop(1, 'rgba(180,60,20,0)');
        } else {
            cellGrad.addColorStop(0, `rgba(120,30,10,${alpha})`);
            cellGrad.addColorStop(0.5, `rgba(140,40,15,${alpha*0.4})`);
            cellGrad.addColorStop(1, 'rgba(140,40,15,0)');
        }
        ctx.fillStyle = cellGrad;
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, Math.random()*0.5, 0, Math.PI*2); ctx.fill();
    }
    const dsX = 400, dsY = 280;
    const dsGrad = ctx.createRadialGradient(dsX, dsY, 0, dsX, dsY, 80);
    dsGrad.addColorStop(0, 'rgba(20,5,2,0.9)'); dsGrad.addColorStop(0.4, 'rgba(50,15,5,0.6)');
    dsGrad.addColorStop(0.7, 'rgba(90,30,10,0.3)'); dsGrad.addColorStop(1, 'rgba(120,40,15,0)');
    ctx.fillStyle = dsGrad;
    ctx.beginPath(); ctx.ellipse(dsX, dsY, 80, 60, 0.2, 0, Math.PI*2); ctx.fill();
    for (let i = 0; i < 5; i++) {
        const x = Math.random()*1024, y = 60+Math.random()*392;
        const rx = Math.random()*35+20, ry = rx*(0.6+Math.random()*0.4);
        const sg = ctx.createRadialGradient(x, y, 0, x, y, rx*1.5);
        sg.addColorStop(0, 'rgba(25,8,3,0.8)'); sg.addColorStop(0.5, 'rgba(60,20,8,0.45)');
        sg.addColorStop(0.8, 'rgba(100,35,12,0.18)'); sg.addColorStop(1, 'rgba(130,45,15,0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.ellipse(x, y, rx*1.5, ry*1.5, 0, 0, Math.PI*2); ctx.fill();
    }
    for (let i = 0; i < 20; i++) {
        const x = Math.random()*1024, y = Math.random()*512, rx = Math.random()*25+15;
        const fg = ctx.createRadialGradient(x, y, 0, x, y, rx);
        fg.addColorStop(0, 'rgba(255,180,100,0.5)'); fg.addColorStop(0.5, 'rgba(220,120,60,0.25)');
        fg.addColorStop(1, 'rgba(200,80,30,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI*2); ctx.fill();
    }
    for (let i = 0; i < 12000; i++) {
        const x = Math.random()*1024, y = Math.random()*512, size = Math.random()*2+0.5;
        const brightness = Math.random()*0.2+0.05, hue = 5+Math.random()*15;
        const sat = 80+Math.random()*20, light = 40+Math.random()*30;
        ctx.fillStyle = `hsla(${hue},${sat}%,${light}%,${brightness})`;
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI*2); ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
}

function createWindParticles() {
    const count = CONFIG.windParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const windData = { dirs: new Float32Array(count*3), speeds: new Float32Array(count),
        phases: new Float32Array(count), maxDist: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        const dirX = Math.sin(phi)*Math.cos(theta), dirY = Math.sin(phi)*Math.sin(theta), dirZ = Math.cos(phi);
        const r = CONFIG.starRadius + Math.random()*8;
        positions[i*3]=r*dirX; positions[i*3+1]=r*dirY; positions[i*3+2]=r*dirZ;
        windData.dirs[i*3]=dirX; windData.dirs[i*3+1]=dirY; windData.dirs[i*3+2]=dirZ;
        windData.speeds[i]=0.1+Math.random()*0.3;
        windData.phases[i]=Math.random()*Math.PI*2;
        windData.maxDist[i]=80+Math.random()*120;
        const hueVar = Math.random();
        colors[i*3]=0.85+hueVar*0.15; colors[i*3+1]=0.25+hueVar*0.25; colors[i*3+2]=0.08+hueVar*0.08;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.8, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data: windData };
}

function createBowShock() {
    const count = CONFIG.bowShockCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const bowShockData = { baseAngles: new Float32Array(count), radii: new Float32Array(count),
        phases: new Float32Array(count), thicknessOffsets: new Float32Array(count) };
    const shockDist = 110, shockSpread = 130;
    for (let i = 0; i < count; i++) {
        const angle = (Math.random()-0.5)*Math.PI*1.6;
        const r = shockDist*(0.85+Math.random()*0.3);
        const arcRadius = r*(1+Math.abs(angle)*0.3);
        positions[i*3] = arcRadius*Math.sin(angle);
        positions[i*3+1] = (Math.random()-0.5)*shockSpread*(0.3+Math.abs(Math.cos(angle))*0.7);
        positions[i*3+2] = -arcRadius*Math.cos(angle);
        bowShockData.baseAngles[i]=angle; bowShockData.radii[i]=r;
        bowShockData.phases[i]=Math.random()*Math.PI*2; bowShockData.thicknessOffsets[i]=Math.random();
        const v = Math.random();
        colors[i*3]=0.7+v*0.3; colors[i*3+1]=0.2+v*0.2; colors[i*3+2]=0.06+v*0.06;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data: bowShockData };
}

function createOrbitParticles() {
    const count = CONFIG.orbitParticleCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
    const orbitData = { semiMajors: new Float32Array(count), semiMinors: new Float32Array(count),
        inclinations: new Float32Array(count), longitudes: new Float32Array(count),
        baseAngles: new Float32Array(count), speeds: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
        const a = 90+Math.random()*130, ecc = 0.08+Math.random()*0.35, b = a*(1-ecc);
        const inc = (Math.random()-0.5)*0.5, lon = Math.random()*Math.PI*2, angle = Math.random()*Math.PI*2;
        orbitData.semiMajors[i]=a; orbitData.semiMinors[i]=b; orbitData.inclinations[i]=inc;
        orbitData.longitudes[i]=lon; orbitData.baseAngles[i]=angle;
        orbitData.speeds[i]=0.08*Math.sqrt(180/a)*0.35;
        const cosA=Math.cos(angle), sinA=Math.sin(angle);
        let x=a*cosA, z=b*sinA, y=0;
        const cosI=Math.cos(inc), sinI=Math.sin(inc);
        const ny=y*cosI-z*sinI, nz=y*sinI+z*cosI; y=ny; z=nz;
        const cosL=Math.cos(lon), sinL=Math.sin(lon);
        const nx=x*cosL-z*sinL, nz2=x*sinL+z*cosL; x=nx; z=nz2;
        positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
        const t=Math.random();
        colors[i*3]=0.75+t*0.25; colors[i*3+1]=0.2+t*0.22; colors[i*3+2]=0.06+t*0.08;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { points: new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.0, map: particleTexture, vertexColors: true, transparent: true,
        opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })), data: orbitData };
}

export function createBetelgeuse() {
    const group = new THREE.Group();
    group.name = 'betelgeuse';

    const starSurface = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.starRadius, 64, 64),
        new THREE.MeshBasicMaterial({ map: createStarTexture(), color: 0xffffff })
    );
    starSurface.name = 'betelgeuse-surface';
    group.add(starSurface);

    const chromosphere = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.chromosphereRadius, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.38,
            side: THREE.BackSide, blending: THREE.AdditiveBlending })
    );
    group.add(chromosphere);

    const coronaInner = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.coronaInnerRadius, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0xff5533, transparent: true, opacity: 0.2,
            side: THREE.BackSide, blending: THREE.AdditiveBlending })
    );
    group.add(coronaInner);

    const coronaOuter = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.coronaOuterRadius, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0xff7744, transparent: true, opacity: 0.1,
            side: THREE.BackSide, blending: THREE.AdditiveBlending })
    );
    group.add(coronaOuter);

    const wind = createWindParticles();
    group.add(wind.points);
    const bowShock = createBowShock();
    group.add(bowShock.points);
    const orbit = createOrbitParticles();
    group.add(orbit.points);

    const clickTarget = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.coronaOuterRadius * 1.3, 16, 16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    clickTarget.name = 'betelgeuse-click';
    group.add(clickTarget);

    group.userData.tick = (time) => {
        starSurface.rotation.y += 0.002;
        const pulse = 1 + Math.sin(time*0.6)*0.04 + Math.sin(time*0.27)*0.03;
        starSurface.scale.set(pulse, pulse, pulse);

        const cPulse = 1 + Math.sin(time*1.8)*0.025;
        chromosphere.scale.set(cPulse, cPulse, cPulse);
        chromosphere.material.opacity = 0.35 + Math.sin(time*1.5)*0.05;

        const ciPulse = 1 + Math.sin(time*1.3)*0.03;
        coronaInner.scale.set(ciPulse, ciPulse, ciPulse);
        coronaInner.material.opacity = 0.18 + Math.sin(time*2)*0.04;

        const coPulse = 1 + Math.sin(time*1.0)*0.035;
        coronaOuter.scale.set(coPulse, coPulse, coPulse);
        coronaOuter.material.opacity = 0.09 + Math.sin(time*1.3)*0.03;

        if (wind.data) {
            const arr = wind.points.geometry.attributes.position.array;
            const n = wind.data.speeds.length;
            for (let i = 0; i < n; i++) {
                const idx = i*3;
                const phase = (time*wind.data.speeds[i] + wind.data.phases[i]) % 1.0;
                const dist = CONFIG.starRadius + phase*wind.data.maxDist[i];
                arr[idx] = wind.data.dirs[idx]*dist;
                arr[idx+1] = wind.data.dirs[idx+1]*dist;
                arr[idx+2] = wind.data.dirs[idx+2]*dist;
            }
            wind.points.geometry.attributes.position.needsUpdate = true;
        }

        if (bowShock.data) {
            const arr = bowShock.points.geometry.attributes.position.array;
            const n = bowShock.data.baseAngles.length;
            for (let i = 0; i < n; i++) {
                const angle = bowShock.data.baseAngles[i], r = bowShock.data.radii[i];
                const arcRadius = r*(1+Math.abs(angle)*0.3);
                const wobble = Math.sin(time*0.5+bowShock.data.phases[i])*3*bowShock.data.thicknessOffsets[i];
                arr[i*3] = arcRadius*Math.sin(angle)+wobble;
                arr[i*3+2] = -arcRadius*Math.cos(angle)+wobble*0.5;
            }
            bowShock.points.geometry.attributes.position.needsUpdate = true;
        }

        if (orbit.data) {
            const arr = orbit.points.geometry.attributes.position.array;
            const n = orbit.data.semiMajors.length;
            for (let i = 0; i < n; i++) {
                const ang = orbit.data.baseAngles[i]+time*orbit.data.speeds[i];
                const a = orbit.data.semiMajors[i], b = orbit.data.semiMinors[i];
                const inc = orbit.data.inclinations[i], lon = orbit.data.longitudes[i];
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

export const betelgeuseSpec = {
    name: 'betelgeuse',
    type: PlanetType.PLANET,
    factory: createBetelgeuse,
    orbit: { radius: 400, speed: 0.0020, phase: Math.PI / 4, inclination: 0.12, eccentricity: 0.15, ascendingNode: 0.3 },  // 环1·倾角6.9°(恒星双环280外)
    appearance: { palette: [0xff4422, 0xff7744, 0xdd5533], supportsColorCustomization: false },
    info: {
        title: '参宿四', subtitle: 'BETELGEUSE · 红超巨星',
        rows: [
            { label: '类型', value: 'M1-2 Ia-ab 红超巨星' },
            { label: '距离', value: '约 548 光年' },
            { label: '表面温度', value: '~3,500 K' },
            { label: '半径', value: '~724 倍太阳半径' },
            { label: '状态', value: '脉动变星，临近超新星' }
        ],
        description: '参宿四是猎户座的红超巨星，一颗临近生命终点的不稳定恒星。其巨大的对流胞和 2019-2020 年的大变暗事件使其成为天文学家重点观测的对象。它随时可能发生超新星爆发，届时将成为天空中仅次于月亮的第二亮天体。'
    }
};

assertValidSpec(betelgeuseSpec);
