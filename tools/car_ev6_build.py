import bpy, bmesh, math, os
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(coll):
        if b.users == 0: coll.remove(b)

def mat(name, color, metal=0.0, rough=0.5, emis=None, emis_str=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emis:
        b.inputs['Emission Color'].default_value = (*emis, 1)
        b.inputs['Emission Strength'].default_value = emis_str
    if alpha < 1.0:
        m.blend_method = 'BLEND'; b.inputs['Alpha'].default_value = alpha
    return m

mPaint = mat('PaintBody', (0.36, 0.02, 0.03), 0.92, 0.22)
mTrim  = mat('TrimDark',  (0.015,0.015,0.018), 0.3, 0.45)
mGlass = mat('GlassCar',  (0.012,0.015,0.022), 0.6, 0.04, alpha=0.5)
mTire  = mat('TireR',     (0.012,0.012,0.014), 0.0, 0.9)
mRim   = mat('RimSilver', (0.75, 0.76, 0.78), 1.0, 0.18)
mLip   = mat('RimLip',    (0.85, 0.85, 0.88), 1.0, 0.10)
mCalip = mat('Caliper',   (0.85, 0.22, 0.02), 0.4, 0.35, (0.5,0.1,0.0), 0.4)
mDisc  = mat('BrakeDisc', (0.30, 0.30, 0.32), 1.0, 0.5)
mHead  = mat('Headlight', (0.9, 0.9, 0.85), 0.0, 0.1, (1.0,0.95,0.85), 4.0)
mTail  = mat('Taillight', (0.6, 0.02, 0.02), 0.0, 0.2, (1.0,0.03,0.02), 3.5)
mPort  = mat('PortDark',  (0.01, 0.01, 0.012), 0.3, 0.3)
mLEDDot= mat('LEDDot',    (0.1, 1.0, 0.4), 0.0, 0.3, (0.1,1.0,0.4), 5.0)

ST = [
    ( 2.30, 0.50, 0.12, 0.50), ( 2.15, 0.62, 0.10, 0.66),
    ( 1.85, 0.72, 0.10, 0.80), ( 1.45, 0.78, 0.12, 0.88),
    ( 1.00, 0.86, 0.14, 0.90), ( 0.60, 1.02, 0.15, 0.90),
    ( 0.10, 1.30, 0.15, 0.88), (-0.50, 1.42, 0.15, 0.86),
    (-1.00, 1.38, 0.15, 0.84), (-1.45, 1.18, 0.14, 0.80),
    (-1.85, 0.98, 0.13, 0.74), (-2.15, 0.86, 0.12, 0.64),
    (-2.30, 0.76, 0.12, 0.50),
]
SEG, EXP = 24, 3.5
def se(a, hw, hz, cz):
    c, s = math.cos(a), math.sin(a)
    return hw*math.copysign(abs(c)**(2.0/EXP), c), cz + hz*math.copysign(abs(s)**(2.0/EXP), s)

bm = bmesh.new(); rings=[]
for (x, ztop, zbot, hw) in ST:
    cz, hz = (ztop+zbot)/2, (ztop-zbot)/2
    ring=[bm.verts.new((x, *se(2*math.pi*s/SEG, hw, hz, cz))) for s in range(SEG)]
    rings.append(ring)
for ri in range(len(rings)-1):
    a, b = rings[ri], rings[ri+1]
    for s in range(SEG):
        t=(s+1)%SEG; bm.faces.new((a[s],a[t],b[t],b[s]))
bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges[:])
me = bpy.data.meshes.new('CarBody'); bm.to_mesh(me); bm.free()
body = bpy.data.objects.new('CarBody', me); bpy.context.collection.objects.link(body)
body.data.materials.append(mPaint)
print('LOFT valid:', body.data.validate(verbose=False))
def wbbox(o):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(deps)
    cs = [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    return (min(c.x for c in cs),max(c.x for c in cs),min(c.y for c in cs),max(c.y for c in cs),min(c.z for c in cs),max(c.z for c in cs))
print('LOFT bb x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % wbbox(body))

def cyl(name, r, depth, loc, material, rot=(0,0,0), verts=28):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.name = name
    if material: o.data.materials.append(material)
    return o
def box(name, sx, sy, sz, loc, material, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale=(sx/2, sy/2, sz/2)
    if material: o.data.materials.append(material)
    return o

# NO booleans — place wheels flush outside body side; decorative arch lip torus
WHEELS=[(1.45,1),(1.45,-1),(-1.45,1),(-1.45,-1)]
print('LOFT verts', len(body.data.vertices))
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True)
try: bpy.ops.object.shade_smooth()
except Exception: pass

# glass greenhouse: proud on the sides
GST=[(0.95,0.86,0.80),(0.60,1.04,0.86),(0.10,1.32,0.86),(-0.50,1.40,0.84),
     (-1.00,1.36,0.82),(-1.45,1.16,0.78),(-1.80,0.98,0.70)]
bm=bmesh.new(); grings=[]
for (x, ztop, hw) in GST:
    zbot=ztop-0.34; cz,hz=(ztop+zbot)/2,(ztop-zbot)/2
    ring=[bm.verts.new((x, *se(2*math.pi*s/SEG, hw+0.014, hz+0.012, cz-0.015))) for s in range(SEG)]
    grings.append(ring)
for ri in range(len(grings)-1):
    a,b=grings[ri],grings[ri+1]
    for s in range(SEG):
        t=(s+1)%SEG; bm.faces.new((a[s],a[t],b[t],b[s]))
bm.faces.new(list(reversed(grings[0]))); bm.faces.new(grings[-1])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
me=bpy.data.meshes.new('Glass'); bm.to_mesh(me); bm.free()
gl=bpy.data.objects.new('Glass', me); bpy.context.collection.objects.link(gl)
gl.data.materials.append(mGlass)
print('GLASS bb x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % wbbox(gl))

# lights — flush slivers (deep boxes, only face visible)
box('HeadL', 0.10, 0.46, 0.07, (2.26, 0.52, 0.50), mHead)
box('HeadR', 0.10, 0.46, 0.07, (2.26,-0.52, 0.50), mHead)
box('TailBar', 0.10, 1.20, 0.06, (-2.26, 0, 0.76), mTail)
box('Grille', 0.10, 1.30, 0.20, (2.24, 0, 0.34), mTrim)   # embedded intake
box('SkirtF', 0.10, 1.50, 0.10, (2.20, 0, 0.20), mTrim)
box('SkirtR', 0.10, 1.40, 0.10, (-2.22, 0, 0.22), mTrim)
box('SkirtL', 0.90, 0.08, 0.10, (-0.1, 0.86, 0.20), mTrim)
box('SkirtR2', 0.90, 0.08, 0.10, (-0.1,-0.86, 0.20), mTrim)

# mirrors: pod on stalk, embedded at body
for sgn in (1,-1):
    box(f'MirStalk{sgn}', 0.03, 0.14, 0.04, (0.70, sgn*0.90, 0.97), mTrim)
    box(f'MirPod{sgn}', 0.11, 0.06, 0.09, (0.68, sgn*1.00, 0.96), mTrim)

# wheels — axle along Y
YW=(math.pi/2,0,0)
for k,(wx,sgn) in enumerate(WHEELS):
    wo = 0.82*sgn   # tire spans ~0.68..0.96; body side at 0.90 -> flush fender line
    cyl(f'Tire{k}', 0.36, 0.28, (wx, wo, 0.36), mTire, rot=YW, verts=40)
    cyl(f'Dish{k}', 0.27, 0.02, (wx, wo+sgn*0.14, 0.36), mRim, rot=YW, verts=36)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.265, minor_radius=0.02,
        location=(wx, wo+sgn*0.15, 0.36), rotation=YW, major_segments=36, minor_segments=10)
    lp=bpy.context.object; lp.name=f'Lip{k}'; lp.data.materials.append(mLip)
    cyl(f'Disc{k}', 0.24, 0.02, (wx, wo-sgn*0.01, 0.36), mDisc, rot=YW, verts=32)
    cyl(f'Hub{k}', 0.06, 0.32, (wx, wo, 0.36), mRim, rot=YW)
    cyl(f'Caliper{k}', 0.05, 0.10, (wx+0.15, wo-sgn*0.02, 0.36), mCalip, rot=YW, verts=14)
    for s in range(5):
        a=s*2*math.pi/5 + math.pi/8
        box(f'Spoke{k}_{s}', 0.26, 0.05, 0.05,
            (wx + 0.13*math.cos(a), wo+sgn*0.155, 0.36 + 0.13*math.sin(a)),
            mRim, rot=(0, -a, 0))
    # arch trim ring on body surface
    bpy.ops.mesh.primitive_torus_add(major_radius=0.47, minor_radius=0.015,
        location=(wx, sgn*0.80, 0.36), rotation=YW, major_segments=36, minor_segments=8)
    tr=bpy.context.object; tr.name=f'ArchTrim{k}'; tr.data.materials.append(mTrim)

# charge port left-rear
cyl('ChargePort', 0.09, 0.06, (-0.60, 0.87, 0.62), mPort, rot=YW)
cyl('ChargePortRing', 0.115, 0.02, (-0.60, 0.90, 0.62), mTrim, rot=YW)
cyl('PortLED', 0.012, 0.02, (-0.45, 0.905, 0.62), mLEDDot, rot=YW, verts=8)

# final checks
print('BODY final bb x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % wbbox(body))
bbx=wbbox(body)
if not((bbx[1]-bbx[0])>4.3 and (bbx[3]-bbx[2])>1.6 and (bbx[5]-bbx[4])>1.2):
    raise RuntimeError('BODY WRONG x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % bbx)

# ---------- studio ----------
world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
world.use_nodes=True
bg=world.node_tree.nodes.get('Background')
bg.inputs[0].default_value=(0.42,0.44,0.48,1); bg.inputs[1].default_value=0.7
bpy.ops.mesh.primitive_plane_add(size=60, location=(0,0,0))
gnd=bpy.context.object; gnd.name='Gnd'
gm=bpy.data.materials.new('GndMat'); gm.use_nodes=True
gb=gm.node_tree.nodes.get('Principled BSDF')
gb.inputs['Base Color'].default_value=(0.14,0.14,0.15,1); gb.inputs['Roughness'].default_value=0.3; gb.inputs['Metallic'].default_value=0.1
gnd.data.materials.append(gm)
def light(name, kind, loc, energy, size=3, rot=(0,0,0)):
    ld=bpy.data.lights.new(name,kind); ld.energy=energy
    if kind=='AREA': ld.size=size
    o=bpy.data.objects.new(name,ld); o.location=loc; o.rotation_euler=rot
    bpy.context.collection.objects.link(o); return o
light('Key','AREA',(4.5,-4.5,5), 900, 5, (math.radians(50),0,math.radians(45)))
light('Rim','AREA',(-5.5,3.5,3.5), 500, 4, (math.radians(65),0,math.radians(-125)))
light('Fill','AREA',(1.5,6,2.5), 250, 6, (math.radians(75),0,math.radians(160)))

scene=bpy.context.scene
try: scene.render.engine='BLENDER_EEVEE_NEXT'
except Exception: scene.render.engine='BLENDER_EEVEE'
scene.view_settings.view_transform='AgX'
scene.render.resolution_x=1100; scene.render.resolution_y=620
try: scene.eevee.taa_render_samples=48
except Exception: pass

from mathutils import Vector as V
out_dir='/home/lex/chargebay/progress/artifacts'
CAM=[('side4',(-8.6,5.6,0.55),(-0.2,0,0.45)),
     ('front',(7.6,3.4,0.50),(0.2,0,0.42)),
     ('port',(-7.2,4.8,0.45),(-0.6,0.5,0.50))]
for nm,cp,tp in CAM:
    cd=bpy.data.cameras.new('Cam'); cam=bpy.data.objects.new('Cam',cd)
    bpy.context.collection.objects.link(cam)
    cam.location=cp; d=V(tp)-V(cp); cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
    scene.camera=cam
    scene.render.filepath=f'{out_dir}/car6_{nm}.png'
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam,do_unlink=True); bpy.data.cameras.remove(cd)

# export car only (no ground/lights)
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
    if o.type=='MESH' and o.name!='Gnd': o.select_set(True)
    if o.type=='LIGHT': o.select_set(False)
bpy.ops.export_scene.gltf(filepath='/home/lex/chargebay/assets/car_ev1.glb', export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('EXPORTED', os.path.getsize('/home/lex/chargebay/assets/car_ev1.glb'))
