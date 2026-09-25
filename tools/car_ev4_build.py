import bpy, bmesh, math, os

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
mGlass = mat('GlassCar',  (0.012,0.015,0.022), 0.6, 0.04, alpha=0.55)
mTire  = mat('TireR',     (0.012,0.012,0.014), 0.0, 0.9)
mRim   = mat('RimSilver', (0.75, 0.76, 0.78), 1.0, 0.18)
mLip   = mat('RimLip',    (0.85, 0.85, 0.88), 1.0, 0.10)
mCalip = mat('Caliper',   (0.85, 0.22, 0.02), 0.4, 0.35, (0.5,0.1,0.0), 0.4)
mDisc  = mat('BrakeDisc', (0.30, 0.30, 0.32), 1.0, 0.5)
mHead  = mat('Headlight', (0.9, 0.9, 0.85), 0.0, 0.1, (1.0,0.95,0.85), 4.0)
mTail  = mat('Taillight', (0.6, 0.02, 0.02), 0.0, 0.2, (1.0,0.03,0.02), 3.5)
mPort  = mat('PortDark',  (0.01, 0.01, 0.012), 0.3, 0.3)
mLEDDot= mat('LEDDot',    (0.1, 1.0, 0.4), 0.0, 0.3, (0.1,1.0,0.4), 5.0)

# ---- body: superellipse loft, x-forward, lengths=4.6, roof 1.42 ----
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
    ring=[]
    for s in range(SEG):
        y, z = se(2*math.pi*s/SEG, hw, hz, cz)
        ring.append(bm.verts.new((x, y, z)))
    rings.append(ring)
for ri in range(len(rings)-1):
    a, b = rings[ri], rings[ri+1]
    for s in range(SEG):
        t = (s+1) % SEG
        bm.faces.new((a[s], a[t], b[t], b[s]))
bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('CarBody'); bm.to_mesh(me); bm.free()
body = bpy.data.objects.new('CarBody', me); bpy.context.collection.objects.link(body)
body.data.materials.append(mPaint)

def cyl(name, r, depth, loc, material, rot=(0, math.pi/2, 0), verts=28):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.name = name
    if material: o.data.materials.append(material)
    return o

def box(name, sx, sy, sz, loc, material, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = (sx/2, sy/2, sz/2)
    if material: o.data.materials.append(material)
    return o

# wheel arch cuts (generous, real gap above tires) — cutter axis along Y
WHEELS = [(1.45, 1), (1.45, -1), (-1.45, 1), (-1.45, -1)]
for k,(wx,sgn) in enumerate(WHEELS):
    c = cyl(f'Cut{k}', 0.46, 3.0, (wx, 0, 0.36), None, rot=(math.pi/2,0,0), verts=32)
    md = body.modifiers.new('b','BOOLEAN'); md.operation='DIFFERENCE'; md.object=c
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.data.objects.remove(c, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True)
try: bpy.ops.object.shade_smooth()
except Exception: pass

# ---- glazing: proud on the sides so windows actually read ----
GST = [(0.95,0.86,0.80),(0.60,1.04,0.86),(0.10,1.32,0.86),(-0.50,1.40,0.84),
       (-1.00,1.36,0.82),(-1.45,1.16,0.78),(-1.80,0.98,0.70)]
bm = bmesh.new(); grings=[]
for (x, ztop, hw) in GST:
    zbot = ztop - 0.34; cz, hz = (ztop+zbot)/2, (ztop-zbot)/2
    ring=[]
    for s in range(SEG):
        y, z = se(2*math.pi*s/SEG, hw+0.012, hz+0.012, cz)
        ring.append(bm.verts.new((x, y, z-0.015)))
    grings.append(ring)
for ri in range(len(grings)-1):
    a, b = grings[ri], grings[ri+1]
    for s in range(SEG):
        t=(s+1)%SEG; bm.faces.new((a[s],a[t],b[t],b[s]))
bm.faces.new(list(reversed(grings[0]))); bm.faces.new(grings[-1])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('Glass'); bm.to_mesh(me); bm.free()
gl = bpy.data.objects.new('Glass', me); bpy.context.collection.objects.link(gl)
gl.data.materials.append(mGlass)
# B-pillar (dark, sits on glass waist) — no floating roof rails this time
for sgn in (1,-1):
    box(f'BPillar{sgn}', 0.05, 0.025, 0.40, (-0.55, sgn*0.87, 1.10), mTrim, rot=(0, 0.06, 0))

# lights
box('HeadL', 0.06, 0.5, 0.07, (2.28, 0.55, 0.50), mHead); box('HeadR', 0.06, 0.5, 0.07, (2.28, -0.55, 0.50), mHead)
box('TailBar', 0.05, 1.30, 0.06, (-2.29, 0, 0.78), mTail)
box('Fascia', 0.05, 1.5, 0.16, (2.29, 0, 0.30), mTrim)      # lower bumper intake
box('Diffuser', 0.06, 1.3, 0.14, (-2.28, 0, 0.26), mTrim)
# panel seam lines (proud dark slivers)
box('SeamHood', 0.9, 0.02, 0.01, (1.55, 0.42, 0.80), mTrim)
box('SeamDoorF', 0.02, 0.02, 0.35, (0.62, 0.895, 0.55), mTrim); box('SeamDoorFR', 0.02, 0.02, 0.35, (0.62, -0.895, 0.55), mTrim)
box('SeamDoorR', 0.02, 0.02, 0.35, (-1.10, 0.865, 0.55), mTrim); box('SeamDoorRR', 0.02, 0.02, 0.35, (-1.10, -0.865, 0.55), mTrim)
box('Beltline', 2.4, 0.02, 0.03, (-0.25, 0.885, 0.86), mTrim); box('BeltlineR', 2.4, 0.02, 0.03, (-0.25, -0.885, 0.86), mTrim)

# mirrors on stalks at A-pillar base
for sgn in (1,-1):
    box(f'MirStalk{sgn}', 0.02, 0.16, 0.03, (0.72, sgn*0.95, 0.98), mTrim, rot=(0,0,sgn*0.25))
    box(f'MirPod{sgn}', 0.10, 0.05, 0.08, (0.70, sgn*1.04, 0.96), mTrim)

# wheels: axle along Y (lateral). tire + dish + lip + disc + caliper + radial spokes in XZ plane
YW = (math.pi/2, 0, 0)  # rot to lay cylinder axis along Y
for k,(wx,sgn) in enumerate(WHEELS):
    wo = 0.75*sgn   # tire center; outer tire face ~0.88
    cyl(f'Tire{k}', 0.36, 0.26, (wx, wo, 0.36), mTire, rot=YW, verts=40)
    cyl(f'SideWall{k}', 0.315, 0.275, (wx, wo, 0.36), mTrim, rot=YW, verts=40)
    cyl(f'Dish{k}', 0.26, 0.02, (wx, wo+sgn*0.13, 0.36), mRim, rot=YW, verts=36)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.255, minor_radius=0.018,
        location=(wx, wo+sgn*0.145, 0.36), rotation=YW, major_segments=36, minor_segments=10)
    lp=bpy.context.object; lp.name=f'Lip{k}'; lp.data.materials.append(mLip)
    cyl(f'Disc{k}', 0.24, 0.025, (wx, wo-sgn*0.02, 0.36), mDisc, rot=YW, verts=32)
    cyl(f'Hub{k}', 0.055, 0.30, (wx, wo, 0.36), mRim, rot=YW)
    cyl(f'Caliper{k}', 0.05, 0.10, (wx+0.16, wo-sgn*0.01, 0.36), mCalip, rot=YW, verts=14)
    for s in range(5):
        a = s*2*math.pi/5 + math.pi/8
        box(f'Spoke{k}_{s}', 0.24, 0.05, 0.06,
            (wx + 0.13*math.cos(a), wo+sgn*0.15, 0.36 + 0.13*math.sin(a)),
            mRim, rot=(0, -a, 0))
    for s in range(5):
        a = s*2*math.pi/5 + math.pi/8
        cyl(f'Bolt{k}_{s}', 0.013, 0.02, (wx + 0.055*math.cos(a), wo+sgn*0.165, 0.36 + 0.055*math.sin(a)), mTrim, rot=YW, verts=8)

# charge port (left rear, +Y in local) recess + ring + LED
cyl('ChargePort', 0.09, 0.06, (-0.60, 0.87, 0.62), mPort)
cyl('ChargePortRing', 0.115, 0.02, (-0.60, 0.90, 0.62), mTrim)
cyl('PortLED', 0.012, 0.02, (-0.45, 0.905, 0.62), mLEDDot, verts=8)

# ---------- assertions ----------
def bb(o):
    b = bpy.context.evaluated_depsgraph_get()
    ob = bpy.data.objects.get(o) if isinstance(o,str) else o
    from mathutils import Vector
    cs = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    mn = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
    mx = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
    return mn, mx
mn,mx = bb(body); print('BODY x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f'%(mn.x,mx.x,mn.y,mx.y,mn.z,mx.z))
mn,mx = bb('Tire0'); print('TIRE0 y %.2f..%.2f r z %.2f..%.2f'%(mn.y,mx.y,mn.z,mx.z))
mn,mx = bb('Glass'); print('GLASS z %.2f..%.2f y %.2f..%.2f'%(mn.z,mx.z,mn.y,mx.y))
print('CHECK length', mx.x - mn.x > 4.0, 'width', mx.y - mn.y > 1.6, 'height', mx.z - mn.z > 1.2)

# ---------- studio render ----------
world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
world.use_nodes = True
bg = world.node_tree.nodes.get('Background')
bg.inputs[0].default_value = (0.28, 0.30, 0.34, 1); bg.inputs[1].default_value = 0.55

bpy.ops.mesh.primitive_plane_add(size=40, location=(0,0,0))
gnd = bpy.context.object; gnd.name='Gnd'
gm = bpy.data.materials.new('GndMat'); gm.use_nodes=True
gb = gm.node_tree.nodes.get('Principled BSDF')
gb.inputs['Base Color'].default_value=(0.16,0.16,0.17,1); gb.inputs['Roughness'].default_value=0.35
gb.inputs['Metallic'].default_value=0.1
gnd.data.materials.append(gm)

def light(name, kind, loc, energy, size=3, rot=(0,0,0)):
    ld = bpy.data.lights.new(name, kind); ld.energy=energy
    if kind=='AREA': ld.size=size
    o = bpy.data.objects.new(name, ld); o.location=loc; o.rotation_euler=rot
    bpy.context.collection.objects.link(o); return o
light('Key','AREA',(4.5,-4.5,5), 900, 5, (math.radians(50),0,math.radians(45)))
light('Rim','AREA',(-5.5,3.5,3.5), 500, 4, (math.radians(65),0,math.radians(-125)))
light('Fill','AREA',(1.5,6,2.5), 250, 6, (math.radians(75),0,math.radians(160)))

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types,'RenderSettings') and 'BLENDER_EEVEE_NEXT' in [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Base Contrast'
scene.render.resolution_x = 1100; scene.render.resolution_y = 620
scene.render.film_transparent = False
try:
    scene.eevee.taa_render_samples = 48
except Exception: pass

out_dir = '/home/lex/chargebay/progress/artifacts'
CAM = [('side4', (-8.6, 5.6, 0.55), (-0.2, 0, 0.45)),
       ('front', (7.6, 3.4, 0.50), (0.2, 0, 0.42)),
       ('port', (-7.2, 4.8, 0.45), (-0.6, 0.5, 0.50))]
from mathutils import Vector
for nm, cp, tp in CAM:
    cd = bpy.data.cameras.new('Cam'); cam = bpy.data.objects.new('Cam', cd)
    bpy.context.collection.objects.link(cam)
    cam.location = cp
    d = Vector(tp) - Vector(cp)
    cam.rotation_euler = d.to_track_quat('-Z','Y').to_euler()
    scene.camera = cam
    scene.render.filepath = f'{out_dir}/car4_{nm}.png'
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True); bpy.data.cameras.remove(cd)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath='/home/lex/chargebay/assets/car_ev1.glb', export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('EXPORTED', os.path.getsize('/home/lex/chargebay/assets/car_ev1.glb'))
