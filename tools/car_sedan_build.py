import bpy, bmesh, math, os
from mathutils import Vector

# clean
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for coll in (bpy.data.meshes, bpy.data.materials):
    for b in list(coll):
        if b.users == 0: coll.remove(b)

def mat(name, color, metal=0.0, rough=0.5, emis=None, emis_str=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emis:
        b.inputs['Emission Color'].default_value = (*emis, 1)
        b.inputs['Emission Strength'].default_value = emis_str
    if alpha < 1.0:
        m.blend_method = 'BLEND'
        b.inputs['Alpha'].default_value = alpha
    return m

mPaint  = mat('PaintBody',  (0.55, 0.05, 0.06), 0.85, 0.28)
mTrim   = mat('TrimDark',   (0.03, 0.03, 0.035), 0.2, 0.55)
mGlass  = mat('GlassCar',   (0.02, 0.03, 0.05), 0.5, 0.05, alpha=0.35)
mTire   = mat('TireR',      (0.015, 0.015, 0.017), 0.0, 0.85)
mRim    = mat('RimSilver',  (0.75, 0.76, 0.78), 1.0, 0.25)
mHead   = mat('Headlight',  (0.9, 0.9, 0.85), 0.0, 0.2, (1.0, 0.95, 0.85), 3.0)
mTail   = mat('Taillight',  (0.6, 0.02, 0.02), 0.0, 0.3, (1.0, 0.03, 0.02), 2.5)
mPort   = mat('PortDark',   (0.01, 0.01, 0.012), 0.3, 0.4)

# ------- body profile: side view, nose = +X, up = +Z -------
profile = [
    ( 2.25, 0.24), ( 2.32, 0.44), ( 2.18, 0.56), ( 1.60, 0.68),
    ( 1.15, 0.76), ( 0.62, 1.20), ( 0.10, 1.33), (-0.70, 1.32),
    (-1.32, 1.10), (-1.85, 0.94), (-2.18, 0.84), (-2.28, 0.55),
    (-2.22, 0.26), (-1.80, 0.18), ( 1.80, 0.18),
]
HALF = 0.90

def taper(x, z):
    f = 1.0
    if z > 1.10:   f = min(f, 0.80)          # roof
    elif z > 0.95: f = min(f, 0.90)          # greenhouse base
    if x >  1.70:  f = min(f, 0.90)          # nose
    if x >  2.10:  f = min(f, 0.78)
    if x < -1.75:  f = min(f, 0.92)          # tail
    return f

bm = bmesh.new()
ringR = []; ringL = []
for (x, z) in profile:
    t = HALF * taper(x, z)
    ringR.append(bm.verts.new((x,  t, z)))
    ringL.append(bm.verts.new((x, -t, z)))
n = len(profile)
for i in range(n):
    j = (i + 1) % n
    bm.faces.new((ringR[i], ringR[j], ringL[j], ringL[i]))
bm.normal_update()
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)

me = bpy.data.meshes.new('CarBody')
bm.to_mesh(me); bm.free()
body = bpy.data.objects.new('CarBody', me)
bpy.context.collection.objects.link(body)
body.data.materials.append(mPaint)

# ------- greenhouse (glass) prism -------
gp = [
    ( 1.18, 0.74), ( 0.62, 1.21), ( 0.10, 1.345), (-0.70, 1.335),
    (-1.34, 1.11), (-1.80, 0.92), (-1.80, 0.74), ( 1.18, 0.74),
]
bm = bmesh.new()
ringR = []; ringL = []
for (x, z) in gp:
    t = 0.905 * taper(x, z + 0.02)
    ringR.append(bm.verts.new((x,  t, z)))
    ringL.append(bm.verts.new((x, -t, z)))
n = len(gp)
for i in range(n - 1):
    j = i + 1
    bm.faces.new((ringR[i], ringR[j], ringL[j], ringL[i]))
# caps
bm.faces.new(list(reversed(ringR)))
bm.faces.new(ringL)
me = bpy.data.meshes.new('Greenhouse')
bm.to_mesh(me); bm.free()
gh = bpy.data.objects.new('Greenhouse', me)
bpy.context.collection.objects.link(gh)
gh.data.materials.append(mGlass)

# ------- wheel arch cutters (boolean) -------
def cyl(name, r, depth, loc, material, rot=(0, math.pi / 2, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.name = name
    if material: o.data.materials.append(material)
    return o

WHEELS = [(1.42, 0.92), (1.42, -0.92), (-1.42, 0.92), (-1.42, -0.92)]
cutters = []
for k, (wx, wy) in enumerate(WHEELS):
    c = cyl(f'Cutter{k}', 0.50, 2.4, (wx, 0, 0.36), None)
    cutters.append(c)
# side skirts / rocker
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0.88, 0.22))
sk1 = bpy.context.object; sk1.scale = (1.45, 0.05, 0.12); sk1.data.materials.append(mTrim)
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, -0.88, 0.22))
sk2 = bpy.context.object; sk2.scale = (1.45, 0.05, 0.12); sk2.data.materials.append(mTrim)

for c in cutters:
    md = body.modifiers.new('bool', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = c
bpy.context.view_layer.objects.active = body
for md in list(body.modifiers):
    bpy.ops.object.modifier_apply(modifier=md.name)
for c in cutters:
    bpy.data.objects.remove(c, do_unlink=True)

# slight bevel on body for edge highlights
md = body.modifiers.new('bev', 'BEVEL'); md.width = 0.012; md.segments = 2
bpy.ops.object.modifier_apply(modifier=md.name)
for p in body.data.polygons: p.use_smooth = True
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); bpy.context.view_layer.objects.active = body
try:
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
except Exception:
    pass

# ------- wheels -------
wheel_objs = []
for k, (wx, wy) in enumerate(WHEELS):
    sgn = 1 if wy > 0 else -1
    tire = cyl(f'Tire{k}', 0.35, 0.26, (wx, wy - sgn * 0.02, 0.36), mTire)
    rim  = cyl(f'Rim{k}',  0.23, 0.28, (wx, wy, 0.36), mRim)
    hub  = cyl(f'Hub{k}',  0.06, 0.30, (wx, wy, 0.36), mTrim)
    wheel_objs += [tire, rim, hub]

# ------- lights -------
bpy.ops.mesh.primitive_cube_add(size=2, location=(2.24, 0, 0.50))
hl = bpy.context.object; hl.scale = (0.05, 0.52, 0.05); hl.data.materials.append(mHead)
bpy.ops.mesh.primitive_cube_add(size=2, location=(-2.24, 0, 0.74))
tl = bpy.context.object; tl.scale = (0.04, 0.70, 0.04); tl.data.materials.append(mTail)

# ------- charge port (rear-left) -------
pp = cyl('ChargePort', 0.10, 0.04, (-0.55, 0.905, 0.62), mPort)
pr = cyl('ChargePortRing', 0.115, 0.02, (-0.55, 0.915, 0.62), mTrim)

# ------- joins -------
# paint group: body + skirts
bpy.ops.object.select_all(action='DESELECT')
for o in [body, sk1, sk2]: o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()

# export whole collection as one GLB
bpy.ops.object.select_all(action='SELECT')
out = '/home/lex/chargebay/assets/car_ev1.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('EXPORTED', out, os.path.getsize(out))
