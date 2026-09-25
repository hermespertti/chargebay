import bpy, math, mathutils, os

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for coll in (bpy.data.meshes, bpy.data.materials):
    for b in list(coll):
        if b.users == 0: coll.remove(b)
bpy.ops.import_scene.gltf(filepath='/home/lex/chargebay/assets/car_ev1.glb')

cam = bpy.data.objects.get('Cam')
if not cam:
    cd = bpy.data.cameras.new('Cam'); cam = bpy.data.objects.new('Cam', cd); bpy.context.collection.objects.link(cam)
bpy.context.scene.camera = cam
cam.location = (5.4, -4.6, 2.1)
tgt = mathutils.Vector((0, 0, 0.65))
cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()

so = bpy.data.objects.get('Sun')
if not so:
    sd = bpy.data.lights.new('Sun', 'SUN'); sd.energy = 3.5
    so = bpy.data.objects.new('Sun', sd); bpy.context.collection.objects.link(so)
so.rotation_euler = (math.radians(55), 0, math.radians(140))

# ground plane
if 'Ground' not in bpy.data.objects:
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    g = bpy.context.object; g.name = 'Ground'
    gm = bpy.data.materials.new('GroundMat'); gm.use_nodes = True
    gb = gm.node_tree.nodes['Principled BSDF']
    gb.inputs['Base Color'].default_value = (0.05, 0.05, 0.055, 1)
    gb.inputs['Roughness'].default_value = 0.4
    g.data.materials.append(gm)

w = bpy.context.scene.world
if not w:
    w = bpy.data.worlds.new('World'); bpy.context.scene.world = w
w.use_nodes = True
bg = w.node_tree.nodes.get('Background')
if bg:
    bg.inputs[0].default_value = (0.6, 0.55, 0.55, 1); bg.inputs[1].default_value = 0.7

bpy.context.scene.render.resolution_x = 1100
bpy.context.scene.render.resolution_y = 720
bpy.context.scene.render.filepath = '/home/lex/chargebay/progress/artifacts/car_ev1_r1.png'
bpy.ops.render.render(write_still=True)
print('RENDER OK')
