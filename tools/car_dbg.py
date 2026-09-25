import bpy, bmesh, math
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
for coll in (bpy.data.meshes, bpy.data.materials): 
    for b in list(coll):
        if b.users==0: coll.remove(b)

def bb(o):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(deps)
    cs = [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    return (min(c.x for c in cs),max(c.x for c in cs),min(c.y for c in cs),max(c.y for c in cs),min(c.z for c in cs),max(c.z for c in cs))

def fmt(b): return 'x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f'%b

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
me = bpy.data.meshes.new('CarBody'); bm.to_mesh(me); bm.free()
body = bpy.data.objects.new('CarBody', me); bpy.context.collection.objects.link(body)
print('LOFT   ', fmt(bb(body)), 'valid:', body.data.validate(verbose=False))

# one cutter at a time
for k,(wx,sgn) in enumerate([(1.45,1),(-1.45,1)]):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.46, depth=3.0, location=(wx,0,0.36), rotation=(math.pi/2,0,0), vertices=32)
    c=bpy.context.object; c.name=f'Cut{k}'
    md = body.modifiers.new('b','BOOLEAN'); md.operation='DIFFERENCE'; md.object=c
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=md.name)
    print('after cut', k, fmt(bb(body)), 'valid:', body.data.validate(verbose=False))
    bpy.data.objects.remove(c, do_unlink=True)
