import bpy
from mathutils import Vector
ob = bpy.data.objects.get('CarBody')
print('exists', ob is not None)
if ob:
    deps = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(deps)
    cs = [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    mn = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
    mx = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
    print('EVAL x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f'%(mn.x,mx.x,mn.y,mx.y,mn.z,mx.z))
    cs = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    mn = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
    mx = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
    print('RAW  x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f'%(mn.x,mx.x,mn.y,mx.y,mn.z,mx.z))
    print('verts', len(ob.data.vertices))
