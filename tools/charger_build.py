import bpy, math, os

# clean scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(coll):
        if b.users == 0:
            coll.remove(b)

def mat(name, color, metal=0.4, rough=0.5, emis=None, emis_str=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emis:
        b.inputs['Emission Color'].default_value = (*emis, 1)
        b.inputs['Emission Strength'].default_value = emis_str
    return m

mBody   = mat('ChargerBody',  (0.150, 0.165, 0.20), 0.55, 0.40)
mTrim   = mat('ChargerTrim',  (0.80, 0.36, 0.05), 0.60, 0.35)
mScreen = mat('ChargerScreen',(0.02, 0.05, 0.09), 0.20, 0.12, (0.08, 0.50, 0.78), 2.0)
mLed    = mat('ChargerLED',   (0.90, 0.95, 1.00), 0.00, 0.30, (0.30, 0.85, 1.00), 4.5)
mSteel  = mat('HolsterSteel', (0.34, 0.36, 0.40), 0.90, 0.30)
mDark   = mat('ChargerDark',  (0.05, 0.05, 0.06), 0.30, 0.70)

def box(name, size, loc, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = (size[0]/2, size[1]/2, size[2]/2)
    o.data.materials.append(material)
    if bevel:
        md = o.modifiers.new('bev','BEVEL'); md.width=bevel; md.segments=2
    return o

def cyl(name, r, depth, loc, material, rot=(0,0,0), verts=16):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.name=name
    o.data.materials.append(material)
    return o

parts = []
# Rule: every neighbor overlaps with GENEROUS shared volume (>=4-6 cm),
# no hairline seams, no rotated floating tiles.

# plinth (trim, wide foot) — column sinks INTO it (overlap, no coincident faces)
parts.append(box('Plinth', (0.96, 0.64, 0.14), (0,0,0.07), mTrim, 0.02))        # z 0..0.14
# single continuous column
parts.append(box('Column', (0.70, 0.48, 1.56), (0,0,0.88), mBody, 0.03))         # z 0.10..1.66
# head block — same footprint family, sinks deep into column top
parts.append(box('Head', (0.78, 0.56, 0.36), (0,-0.02,1.56), mBody, 0.03))       # z 1.38..1.74
# screen bezel + screen embedded in head +X face (same side as holster — operator faces the car)
parts.append(box('ScreenBezel', (0.08, 0.54, 0.30), (0.31, 0, 1.56), mDark, 0.01))
parts.append(box('Screen',      (0.08, 0.46, 0.24), (0.318, 0, 1.56), mScreen, 0.008))
# LED halo slab — deeper embed (overlaps head top 1.74 by 3cm, overhangs 1cm)
parts.append(box('LEDTop', (0.80, 0.58, 0.06), (0,-0.02,1.725), mLed))           # z 1.695..1.755
# side LED stripe half-embedded in column +X face (flanks the screen)
parts.append(box('LEDSide', (0.03, 0.50, 0.80), (0.355, 0, 0.90), mLed))
# back panel detail on -Y
parts.append(box('BackPanel', (0.50, 0.06, 1.10), (0,-0.26,0.90), mDark, 0.01))
parts.append(box('BrandPlate', (0.34, 0.03, 0.12), (0,0.255,0.95), mTrim, 0.006))

# holster arm on +X — starts INSIDE column (x0.30 < half 0.35) and reaches past ring
parts.append(box('HolsterArm', (0.42, 0.12, 0.12), (0.52, 0, 0.86), mSteel, 0.02))  # x 0.31..0.73
# cradle ring (axis Z up) at arm end, arm passes through its edge
parts.append(cyl('CradleRing', 0.105, 0.12, (0.70, 0, 0.86), mSteel, verts=16))
# guide cone under ring (catches plug nozzle)
parts.append(cyl('CradleCone', 0.055, 0.10, (0.70, 0, 0.775), mDark, verts=12))

# cable gland on +X lower, embedded through column jacket
parts.append(cyl('CableGland', 0.07, 0.18, (0.35, 0, 0.34), mDark, rot=(0, math.radians(90), 0), verts=12))

# feet under plinth
for sx in (-1,1):
    for sy in (-1,1):
        parts.append(box('Foot', (0.14, 0.14, 0.05), (sx*0.36, sy*0.24, 0.025), mDark, 0.01))

# join all into one mesh
bpy.ops.object.select_all(action='DESELECT')
for p in parts: p.select_set(True)
bpy.context.view_layer.objects.active = parts[1]
bpy.ops.object.join()
charger = bpy.context.view_layer.objects.active
charger.name='ChargerStation'
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

out='/home/lex/chargebay/assets/charger.glb'
bpy.ops.object.select_all(action='DESELECT')
charger.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('EXPORTED', out, os.path.getsize(out))
