import bpy, bmesh, math, os
from mathutils import Vector

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
mGlass = mat('GlassCar',  (0.03, 0.04, 0.06), 0.6, 0.04, alpha=0.25)
mTire  = mat('TireR',     (0.015, 0.015, 0.017), 0.0, 0.85)
mRim   = mat('RimSilver', (0.72, 0.73, 0.75), 1.0, 0.20)
mCalip = mat('Caliper',   (0.85, 0.28, 0.03), 0.4, 0.35)
mDisc  = mat('BrakeDisc', (0.35, 0.35, 0.37), 1.0, 0.45)
mHead  = mat('Headlight', (0.9, 0.9, 0.85), 0.0, 0.12, (1.0, 0.95, 0.85), 3.0)
mTail  = mat('Taillight', (0.6, 0.02, 0.02), 0.0, 0.22, (1.0, 0.03, 0.02), 2.5)
mPort  = mat('PortDark',  (0.01, 0.01, 0.012), 0.3, 0.35)

# ------- body: multi-rail loft around closed side profile -------
# nose=+X, left=+Y, up=+Z, z=0 ground
profile = [
    ( 2.18, 0.12), ( 2.26, 0.26), ( 2.24, 0.42), ( 2.14, 0.54),
    ( 1.92, 0.62), ( 1.60, 0.68), ( 1.25, 0.73), ( 1.00, 0.77),
    ( 0.72, 0.92), ( 0.50, 1.10), ( 0.22, 1.24), (-0.15, 1.29),
    (-0.60, 1.30), (-0.95, 1.27), (-1.25, 1.16), (-1.55, 1.02),
    (-1.82, 0.96), (-2.04, 0.92), (-2.18, 0.82), (-2.28, 0.64),
    (-2.30, 0.44), (-2.26, 0.24), (-2.14, 0.14),
    (-1.60, 0.10), (-0.50, 0.08), ( 0.50, 0.08), ( 1.60, 0.10),
]
N = len(profile)
FRACS = [0.0, 0.62, 0.86, 1.0]     # inner spine -> widest

def halfwidth(x, z):
    f = 1.0
    if z > 1.22:   f *= 0.84
    elif z > 1.02: f *= 0.90 + 0.10*(z-1.02)/0.20
    if x >  1.90: f *= 0.93 - 0.11*(x-1.90)/0.36
    if x < -1.80: f *= 0.96 + 0.02*(x+1.80)/0.50
    return 0.90 * f

bm = bmesh.new()
rR = [bm.verts.new((x, halfwidth(x,z), z)) for x,z in profile]
rL = [bm.verts.new((x, -halfwidth(x,z), z)) for x,z in profile]
for i in range(N):
    j = (i+1) % N
    bm.faces.new((rR[i], rR[j], rL[j], rL[i]))
# caps
try: bm.faces.new(list(reversed(rR)))
except Exception: pass
try: bm.faces.new(rL)
except Exception: pass
bm.normal_update()
me = bpy.data.meshes.new('CarBody'); bm.to_mesh(me); bm.free()
body = bpy.data.objects.new('CarBody', me); bpy.context.collection.objects.link(body)
body.data.materials.append(mPaint)

def cyl(name, r, depth, loc, material, rot=(0, math.pi/2, 0), verts=28):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.name = name
    if material: o.data.materials.append(material)
    return o

# wheel arch shallow cuts
WHEELS = [(1.45, 1), (1.45, -1), (-1.45, 1), (-1.45, -1)]
cutters = [cyl(f'Cut{k}', 0.52, 2.3, (wx, 0, 0.33), None, verts=24) for k,(wx,sgn) in enumerate(WHEELS)]
for c in cutters:
    md = body.modifiers.new('b','BOOLEAN'); md.operation='DIFFERENCE'; md.object=c
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=md.name)
for c in cutters: bpy.data.objects.remove(c, do_unlink=True)

# polish
md = body.modifiers.new('ss','SUBSURF'); md.levels = 1; md.render_levels = 2
bpy.context.view_layer.objects.active = body
bpy.ops.object.modifier_apply(modifier=md.name)
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True)
try: bpy.ops.object.shade_smooth()
except Exception: pass

# glass: proper quad strip per side (top row + bottom row)
ghp = [(1.02,0.96),(0.72,1.06),(0.50,1.16),(0.22,1.235),(-0.15,1.265),(-0.60,1.275),(-0.95,1.245),(-1.25,1.135),(-1.55,1.005),(-1.70,0.95)]
gbp = [(x, z-0.17) for x,z in ghp]
bm = bmesh.new()
for row in (ghp, gbp):
    pass
topR=[bm.verts.new((x,(halfwidth(x,z)+0.014),z)) for x,z in ghp]
botR=[bm.verts.new((x,(halfwidth(x,z)+0.014),z)) for x,z in gbp]
topL=[bm.verts.new((x,-(halfwidth(x,z)+0.014),z)) for x,z in ghp]
botL=[bm.verts.new((x,-(halfwidth(x,z)+0.014),z)) for x,z in gbp]
for i in range(len(ghp)-1):
    j=i+1
    bm.faces.new((topR[i],topR[j],botR[j],botR[i]))
    bm.faces.new((botL[i],botL[j],topL[j],topL[i]))
me = bpy.data.meshes.new('Glass'); bm.to_mesh(me); bm.free()
gl = bpy.data.objects.new('Glass', me); bpy.context.collection.objects.link(gl)
gl.data.materials.append(mGlass)

# lights
bpy.ops.mesh.primitive_cube_add(size=2, location=(2.19, 0, 0.47)); hl=bpy.context.object
hl.scale=(0.05, 0.56, 0.05); hl.data.materials.append(mHead)
bpy.ops.mesh.primitive_cube_add(size=2, location=(-2.27, 0, 0.66)); tl=bpy.context.object
tl.scale=(0.045, 0.70, 0.05); tl.data.materials.append(mTail)

# wheels: tire + recessed rim + OUTER spokes + disc + caliper + hub
for k,(wx,sgn) in enumerate(WHEELS):
    wy = sgn*0.88
    tire = cyl(f'Tire{k}', 0.335, 0.25, (wx, wy-sgn*0.02, 0.33), mTire, verts=36)
    rim  = cyl(f'Rim{k}', 0.235, 0.12, (wx, wy-sgn*0.04, 0.33), mRim, verts=28)
    disc = cyl(f'Disc{k}', 0.19, 0.03, (wx, wy-sgn*0.12, 0.33), mDisc, verts=28)
    cal  = cyl(f'Caliper{k}', 0.055, 0.10, (wx+0.15, wy-sgn*0.12, 0.33), mCalip, verts=14)
    for s in range(8):
        a = s*math.pi/4
        bpy.ops.mesh.primitive_cylinder_add(radius=0.026, depth=0.20, location=(wx + 0.115*math.cos(a), wy+sgn*0.08, 0.33 + 0.115*math.sin(a)), rotation=(0, math.pi/2 - a, 0), vertices=10)
        sp=bpy.context.object; sp.name=f'Spoke{k}_{s}'
        sp.scale=(1.0, 0.55, 1.0)
        sp.data.materials.append(mRim)
    hub = cyl(f'Hub{k}', 0.05, 0.30, (wx, wy+sgn*0.05, 0.33), mTrim)

# charge port rear-left (+Y)
pp = cyl('ChargePort', 0.09, 0.05, (-0.60, 0.90, 0.58), mPort)
pr = cyl('ChargePortRing', 0.11, 0.02, (-0.60, 0.915, 0.58), mTrim)

bpy.ops.object.select_all(action='SELECT')
out='/home/lex/chargebay/assets/car_ev1.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('EXPORTED', out, os.path.getsize(out))
