import bpy, math, mathutils
print('OBJECTS:', [o.name for o in bpy.context.scene.objects])
cs = bpy.data.objects.get('ChargerStation')
bb = [cs.matrix_world @ mathutils.Vector(c) for c in cs.bound_box]
xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
print('BBOX x', round(min(xs),3), round(max(xs),3), 'y', round(min(ys),3), round(max(ys),3), 'z', round(min(zs),3), round(max(zs),3))

cam = bpy.data.objects.get('Cam')
if not cam:
    cd = bpy.data.cameras.new('Cam'); cam = bpy.data.objects.new('Cam', cd); bpy.context.collection.objects.link(cam)
bpy.context.scene.camera = cam
cam.location = (2.2, -1.1, 1.15)
tgt = mathutils.Vector((0.15, 0, 0.88))
cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z','Y').to_euler()

so = bpy.data.objects.get('Sun')
if not so:
    sd = bpy.data.lights.new('Sun','SUN'); sd.energy = 3.0
    so = bpy.data.objects.new('Sun', sd); bpy.context.collection.objects.link(so)
so.rotation_euler = (math.radians(50), 0, math.radians(35))

w = bpy.context.scene.world
if not w:
    w = bpy.data.worlds.new('World'); bpy.context.scene.world = w
w.use_nodes = True
bg = w.node_tree.nodes.get('Background')
if bg:
    bg.inputs[0].default_value = (0.5,0.6,0.8,1); bg.inputs[1].default_value = 0.6

bpy.context.scene.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
bpy.context.scene.render.resolution_x = 960
bpy.context.scene.render.resolution_y = 720
bpy.context.scene.render.filepath = '/home/lex/chargebay/progress/artifacts/charger_blender2.png'
bpy.ops.render.render(write_still=True)
print('RENDER OK')
