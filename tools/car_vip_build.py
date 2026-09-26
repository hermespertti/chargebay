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

mPaint = mat('PaintBody', (0.10, 0.06, 0.28), 0.95, 0.18)   # deep violet pearl
mTrim  = mat('TrimDark',  (0.015,0.015,0.018), 0.3, 0.45)
mCarbon= mat('Carbon',    (0.02,0.02,0.024), 0.55, 0.35)
mGlass = mat('GlassCar',  (0.012,0.015,0.022), 0.6, 0.04, alpha=0.5)
mTire  = mat('TireR',     (0.012,0.012,0.014), 0.0, 0.9)
mRim   = mat('RimSilver', (0.72, 0.73, 0.76), 1.0, 0.16)
mLip   = mat('RimLip',    (0.85, 0.85, 0.88), 1.0, 0.10)
mCalip = mat('Caliper',   (0.85, 0.22, 0.02), 0.4, 0.35, (0.5,0.1,0.0), 0.4)
mDisc  = mat('BrakeDisc', (0.30, 0.30, 0.32), 1.0, 0.5)
mHead  = mat('Headlight', (0.9, 0.9, 0.85), 0.0, 0.1, (1.0,0.95,0.85), 4.0)
mTail  = mat('Taillight', (0.6, 0.02, 0.02), 0.0, 0.2, (1.0,0.03,0.02), 3.5)
mPort  = mat('PortDark',  (0.01, 0.01, 0.012), 0.3, 0.3)
mLEDDot= mat('LEDDot',    (0.1, 1.0, 0.4), 0.0, 0.3, (0.1,1.0,0.4), 5.0)

# low mid-engine supercar profile: long nose, cab-forward fastback, short high tail
ST = [
    ( 2.25, 0.34, 0.10, 0.55), ( 2.10, 0.42, 0.10, 0.78),
    ( 1.70, 0.48, 0.10, 0.92), ( 1.20, 0.54, 0.12, 0.98),
    ( 0.70, 0.62, 0.14, 1.00), ( 0.30, 0.95, 0.15, 0.96),
    (-0.15, 1.18, 0.15, 0.92), (-0.70, 1.12, 0.15, 0.88),
    (-1.20, 0.98, 0.14, 0.94), (-1.70, 0.84, 0.13, 0.90),
    (-2.05, 0.72, 0.12, 0.78), (-2.25, 0.62, 0.12, 0.60),
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

# greenhouse (cab-forward)
GST=[(0.72,0.66,0.78),(0.40,1.00,0.80),(-0.15,1.16,0.78),(-0.70,1.10,0.74),(-1.05,0.96,0.64)]
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

# dark interior so glass reads as glazing
bm=bmesh.new(); ir=[]
for (x, ztop, hw) in GST:
    zbot=ztop-0.40; cz,hz=(ztop+zbot)/2,(ztop-zbot)/2
    ring=[bm.verts.new((x, *se(2*math.pi*s/SEG, hw-0.03, hz-0.02, cz-0.02))) for s in range(SEG)]
    ir.append(ring)
for ri in range(len(ir)-1):
    a,b=ir[ri],ir[ri+1]
    for s in range(SEG):
        t=(s+1)%SEG; bm.faces.new((a[s],a[t],b[t],b[s]))
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
me=bpy.data.meshes.new('Cabin'); bm.to_mesh(me); bm.free()
cab=bpy.data.objects.new('Cabin', me); bpy.context.collection.objects.link(cab)
cab.data.materials.append(mat('Seat',(0.05,0.05,0.06),0,0.8))

# splitter + skirts + diffuser (carbon aero)

for sgn in (-1,1):
    box('Skirt'+('L' if sgn<0 else 'R'), 1.70, 0.05, 0.10, (-0.15, sgn*0.95, 0.22), mCarbon)
    box('Scoop'+('L' if sgn<0 else 'R'), 0.55, 0.06, 0.26, (-0.85, sgn*0.96, 0.52), mTrim, rot=(0, sgn*0.12, 0))
box('Diffuser', 0.30, 1.60, 0.14, (-2.16, 0.0, 0.24), mCarbon)
for i in range(4):
    box('DiffFin%d'%i, 0.28, 0.02, 0.13, (-2.16, -0.6+i*0.4, 0.24), mTrim)
box('Ducktail', 0.40, 1.70, 0.035, (-2.02, 0.0, 0.795), mCarbon)

# lights: slim slanted headlight blades, quad round tails
for sgn in (-1,1):
    h=box('Head'+('L' if sgn<0 else 'R'), 0.10, 0.34, 0.04, (2.24, sgn*0.56, 0.42), mHead, rot=(0, 0.0, sgn*0.30))   # slim vertical LED blade at nose tip
# splitter lip with dark shadow gap below the nose
box('SplitterF', 0.34, 1.86, 0.035, (2.16, 0.0, 0.115), mCarbon)
box('SplitLip', 0.10, 1.90, 0.06, (2.30, 0.0, 0.155), mTrim)
for i in range(4):
    cyl('Tail%d'%i, 0.045, 0.05, (-2.24, -0.66+i*0.44, 0.66), mTail, rot=(0, math.pi/2, 0), verts=18)

# wheels: big 19s, twin 5-spoke
WHEELS=[(1.45,1),(1.45,-1),(-1.45,1),(-1.45,-1)]
for i,(wx,ws) in enumerate(WHEELS):
    y=ws*0.94
    cyl('Tire%d'%i, 0.33, 0.24, (wx, y, 0.33), mTire, rot=(math.pi/2,0,0))
    cyl('Disc%d'%i, 0.20, 0.03, (wx, y-0.02*ws, 0.33), mDisc, rot=(math.pi/2,0,0))
    cyl('Caliper%d'%i, 0.16, 0.06, (wx+0.10, y-0.05*ws, 0.33), mCaliper if False else mCalip, rot=(math.pi/2,0,0))
    cyl('Hub%d'%i, 0.06, 0.28, (wx, y, 0.33), mRim, rot=(math.pi/2,0,0))
    cyl('Dish%d'%i, 0.12, 0.02, (wx, y+0.13*ws, 0.33), mRim, rot=(math.pi/2,0,0))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.31, minor_radius=0.018, location=(wx, y+0.135*ws, 0.33), rotation=(math.pi/2,0,0), major_segments=36, minor_segments=10)
    lp=bpy.context.object; lp.name='Lip%d'%i; lp.data.materials.append(mLip)
    for k in range(10):
        a=math.pi*2*k/10; th = 0.09 if k%2==0 else 0.05   # twin-spoke pattern
        sp=box('Spoke%d_%d'%(i,k), th*2, 0.024, 0.024, (wx+0.155*math.cos(a), y+0.135*ws, 0.33+0.155*math.sin(a)), mRim)
        sp.rotation_mode='XYZ'; sp.rotation_euler=(0, -a, 0)   # radial in X-Z plane about lateral Y axle

# charge port: left-real lateral rear (port side faces +Y lateral in Blender)
cyl('ChargePort', 0.07, 0.06, (-0.55, 0.90, 0.58), mPort, rot=(math.pi/2,0,0))
bpy.ops.mesh.primitive_torus_add(major_radius=0.085, minor_radius=0.012, location=(-0.55, 0.93, 0.58), rotation=(math.pi/2,0,0), major_segments=24, minor_segments=8)
pr=bpy.context.object; pr.name='ChargePortRing'; pr.data.materials.append(mLEDDot)
cyl('PortLED', 0.012, 0.02, (-0.40, 0.935, 0.58), mLEDDot, rot=(math.pi/2,0,0), verts=12)

# badge + mirrors
box('BadgeF', 0.02, 0.14, 0.06, (2.27, 0.0, 0.40), mLip)
for sgn in (-1,1):
    box('MirPod'+str(sgn), 0.11, 0.05, 0.045, (0.62, sgn*1.02, 0.78), mTrim)
    box('MirStalk'+str(sgn), 0.09, 0.07, 0.02, (0.60, sgn*0.95, 0.76), mTrim)

print('BODY final bb', ['%.2f'%v for v in wbbox(body)] if 'wbbox' in dir() else '')
bb=body.bound_box
xs=[c[0] for c in bb]; ys=[c[1] for c in bb]; zs=[c[2] for c in bb]
print('bbox x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % (min(xs),max(xs),min(ys),max(ys),min(zs),max(zs)))

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath='/home/lex/chargebay/assets/car_vip.glb', export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('EXPORTED', os.path.getsize('/home/lex/chargebay/assets/car_vip.glb'))