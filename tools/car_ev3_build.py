import bpy, bmesh, math, os

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for coll in (bpy.data.meshes, bpy.data.materials):
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

mPaint = mat('PaintBody', (0.55, 0.05, 0.06), 0.9, 0.20)
mTrim  = mat('TrimDark',  (0.03, 0.03, 0.035), 0.2, 0.5)
mGlass = mat('GlassCar',  (0.03, 0.04, 0.06), 0.6, 0.04, alpha=0.22)
mTire  = mat('TireR',     (0.015, 0.015, 0.017), 0.0, 0.85)
mRim   = mat('RimSilver', (0.72, 0.73, 0.75), 1.0, 0.20)
mCalip = mat('Caliper',   (0.85, 0.28, 0.03), 0.4, 0.35)
mDisc  = mat('BrakeDisc', (0.35, 0.35, 0.37), 1.0, 0.45)
mHead  = mat('Headlight', (0.9, 0.9, 0.85), 0.0, 0.12, (1.0, 0.95, 0.85), 3.0)
mTail  = mat('Taillight', (0.6, 0.02, 0.02), 0.0, 0.22, (1.0, 0.03, 0.02), 2.5)
mPort  = mat('PortDark',  (0.01, 0.01, 0.012), 0.3, 0.35)

# ---- longitudinal stations: x, ztop, zbot, halfwidth ----
# realistic sedan: 4.6 m long, 1.8 wide, roof 1.42, floor 0.14
ST = [
    ( 2.30, 0.50, 0.12, 0.50),
    ( 2.15, 0.62, 0.10, 0.66),
    ( 1.85, 0.72, 0.10, 0.80),
    ( 1.45, 0.78, 0.12, 0.88),
    ( 1.00, 0.86, 0.14, 0.90),
    ( 0.60, 1.02, 0.15, 0.90),
    ( 0.10, 1.30, 0.15, 0.88),
    (-0.50, 1.40, 0.15, 0.86),
    (-1.00, 1.36, 0.15, 0.84),
    (-1.45, 1.16, 0.14, 0.80),
    (-1.85, 0.98, 0.13, 0.74),
    (-2.15, 0.86, 0.12, 0.64),
    (-2.30, 0.76, 0.12, 0.50),
]
SEG = 24
EXP = 3.5   # superellipse exponent -> flatter sides/bottom, car-like

def se(a, hw, hz, cz):
    c = math.cos(a); s = math.sin(a)
    y = hw * math.copysign(abs(c)**(2.0/EXP), c)
    z = cz + hz * math.copysign(abs(s)**(2.0/EXP), s)
    return y, z

bm = bmesh.new()
rings = []
for (x, ztop, zbot, hw) in ST:
    cz = (ztop + zbot) / 2.0; hz = (ztop - zbot) / 2.0
    ring = []
    for s in range(SEG):
        a = 2*math.pi*s/SEG
        y, z = se(a, hw, hz, cz)
        ring.append(bm.verts.new((x, y, z)))
    rings.append(ring)
for ri in range(len(rings)-1):
    a = rings[ri]; b = rings[ri+1]
    for s in range(SEG):
        t = (s+1) % SEG
        bm.faces.new((a[s], a[t], b[t], b[s]))
bm.faces.new(list(reversed(rings[0])))
bm.faces.new(rings[-1])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('CarBody'); bm.to_mesh(me); bm.free()
body = bpy.data.objects.new('CarBody', me); bpy.context.collection.objects.link(body)
body.data.materials.append(mPaint)

def cyl(name, r, depth, loc, material, rot=(0, math.pi/2, 0), verts=28):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.name = name
    if material: o.data.materials.append(material)
    return o

# wheel arches
WHEELS = [(1.45, 1), (1.45, -1), (-1.45, 1), (-1.45, -1)]
cutters = [cyl(f'Cut{k}', 0.50, 2.6, (wx, 0, 0.34), None, verts=24) for k,(wx,sgn) in enumerate(WHEELS)]
for c in cutters:
    md = body.modifiers.new('b','BOOLEAN'); md.operation='DIFFERENCE'; md.object=c
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=md.name)
for c in cutters: bpy.data.objects.remove(c, do_unlink=True)

bpy.ops.object.select_all(action='DESELECT'); body.select_set(True)
try: bpy.ops.object.shade_smooth()
except Exception: pass

# ---- greenhouse as its own superellipse shell (top cap band) ----
GST = [
    ( 0.95, 0.86, 0.80), ( 0.60, 1.04, 0.86), ( 0.10, 1.32, 0.86),
    (-0.50, 1.42, 0.84), (-1.00, 1.38, 0.82), (-1.45, 1.18, 0.78),
    (-1.80, 1.00, 0.70),
]
bm = bmesh.new()
grings=[]
for (x, ztop, hw) in GST:
    zbot = ztop - 0.30
    cz=(ztop+zbot)/2.0; hz=(ztop-zbot)/2.0
    ring=[]
    for s in range(SEG):
        a=2*math.pi*s/SEG
        y,z = se(a, hw+0.012, hz+0.01, cz)
        ring.append(bm.verts.new((x,y,z)))
    grings.append(ring)
for ri in range(len(grings)-1):
    a=grings[ri]; b=grings[ri+1]
    for s in range(SEG):
        t=(s+1)%SEG
        bm.faces.new((a[s],a[t],b[t],b[s]))
bm.faces.new(list(reversed(grings[0])))
bm.faces.new(grings[-1])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('Glass'); bm.to_mesh(me); bm.free()
gl = bpy.data.objects.new('Glass', me); bpy.context.collection.objects.link(gl)
gl.data.materials.append(mGlass)

# lights
bpy.ops.mesh.primitive_cube_add(size=2, location=(2.27, 0, 0.52)); hl=bpy.context.object
hl.scale=(0.05, 0.44, 0.05); hl.data.materials.append(mHead)
bpy.ops.mesh.primitive_cube_add(size=2, location=(-2.28, 0, 0.72)); tl=bpy.context.object
tl.scale=(0.045, 0.50, 0.05); tl.data.materials.append(mTail)

# wheels
for k,(wx,sgn) in enumerate(WHEELS):
    wy = sgn*0.92
    tire = cyl(f'Tire{k}', 0.34, 0.24, (wx, wy, 0.34), mTire, verts=36)
    rim  = cyl(f'Rim{k}', 0.22, 0.10, (wx, wy+sgn*0.09, 0.34), mRim, verts=28)
    disc = cyl(f'Disc{k}', 0.18, 0.03, (wx, wy+sgn*0.02, 0.34), mDisc, verts=28)
    cal  = cyl(f'Caliper{k}', 0.05, 0.09, (wx+0.13, wy+sgn*0.02, 0.34), mCalip, verts=14)
    for s in range(8):
        a = s*math.pi/4
        bpy.ops.mesh.primitive_cylinder_add(radius=0.024, depth=0.19,
            location=(wx + 0.105*math.cos(a), wy+sgn*0.09, 0.34 + 0.105*math.sin(a)),
            rotation=(0, math.pi/2 - a, 0), vertices=10)
        sp=bpy.context.object; sp.name=f'Spoke{k}_{s}'; sp.data.materials.append(mRim)
    hub = cyl(f'Hub{k}', 0.045, 0.24, (wx, wy+sgn*0.10, 0.34), mTrim)

# mirrors
for sgn in (1,-1):
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0.62, sgn*0.96, 0.98))
    mi=bpy.context.object; mi.scale=(0.09,0.05,0.06); mi.data.materials.append(mTrim)

# charge port rear-left (+Y)
pp = cyl('ChargePort', 0.09, 0.05, (-0.60, 0.88, 0.62), mPort)
pr = cyl('ChargePortRing', 0.11, 0.02, (-0.60, 0.895, 0.62), mTrim)

bpy.ops.object.select_all(action='SELECT')
out='/home/lex/chargebay/assets/car_ev1.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('EXPORTED', out, os.path.getsize(out))
