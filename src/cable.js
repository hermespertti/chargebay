// CABLE PHYSICS (Verlet) — extracted from main.js
import * as THREE from 'three';

// ---- cable physics (Verlet chain per bay, connector -> port/hand) ----
const CABLE_SEGS=26, CABLE_LEN=4.2, CABLE_RANGE=4.0;
function makeCable(scene){
  const pts=[], old=[];
  for(let i=0;i<=CABLE_SEGS;i++){ pts.push(new THREE.Vector3(0,1,-6)); old.push(new THREE.Vector3(0,1,-6)); }
  const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>p.clone())), CABLE_SEGS*2, 0.055, 8, false);
  const mat=new THREE.MeshStandardMaterial({color:0x191e26, roughness:0.55, metalness:0.15});
  const mesh=new THREE.Mesh(geo,mat); mesh.castShadow=true; mesh.frustumCulled=false; scene.add(mesh);
  return {pts, old, mesh, geo};
}
function cableStep(cab, a, b, dt){
  // verlet: gravity + constraint solve, endpoints pinned to a(bay end) and b(plug end)
  const g=-9.8*dt*dt;
  for(let i=1;i<CABLE_SEGS;i++){
    const p=cab.pts[i], o=cab.old[i];
    const vx=(p.x-o.x)*0.985, vy=(p.y-o.y)*0.985, vz=(p.z-o.z)*0.985;
    o.copy(p); p.x+=vx; p.y+=vy+g; p.z+=vz;
    // collide with car body as rough box while docked
    if(p.y<0.06) p.y=0.06;
  }
  const rest=CABLE_LEN/CABLE_SEGS;
  for(let k=0;k<8;k++){
    cab.pts[0].copy(a); cab.pts[CABLE_SEGS].copy(b);
    for(let i=0;i<CABLE_SEGS;i++){
      const p0=cab.pts[i], p1=cab.pts[i+1];
      let dx=p1.x-p0.x, dy=p1.y-p0.y, dz=p1.z-p0.z;
      const d=Math.sqrt(dx*dx+dy*dy+dz*dz)||1e-6;
      const diff=(d-rest)/d*0.5;
      if(i!==0){ p0.x+=dx*diff; p0.y+=dy*diff; p0.z+=dz*diff; }
      if(i+1!==CABLE_SEGS){ p1.x-=dx*diff; p1.y-=dy*diff; p1.z-=dz*diff; }
    }
  }
  cab.pts[0].copy(a); cab.pts[CABLE_SEGS].copy(b);
  // rebuild tube geometry
  const curve=new THREE.CatmullRomCurve3(cab.pts);
  const ng=new THREE.TubeGeometry(curve, CABLE_SEGS*2, 0.055, 8, false);
  cab.mesh.geometry.dispose(); cab.mesh.geometry=ng;
}
export { CABLE_SEGS, CABLE_LEN, CABLE_RANGE, makeCable, cableStep };
