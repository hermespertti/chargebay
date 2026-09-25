import bpy, bmesh, math
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
for coll in (bpy.data.meshes, bpy.data.materials):
    for b in list(coll):
        if b.users==0: coll.remove(b)

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
faces=[]
for ri in range(len(rings)-1):
    a, b = rings[ri], rings[ri+1]
    for s in range(SEG):
        t=(s+1)%SEG
        faces.append(bm.faces.new((a[s],a[t],b[t],b[s])))
faces.append(bm.faces.new(list(reversed(rings[0]))))
faces.append(bm.faces.new(rings[-1]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
# manifold check: count edges with >2 faces
from collections import Counter
cnt = Counter()
for e in bm.edges:
    cnt[len(e.link_faces)] += 1
print('edge face-count histogram:', dict(cnt))
degen = [i for i,e in enumerate(bm.edges) if e.is_valid_geometry(bm)]
degen2 = sum(1 for e in bm.edges if len(e.link_faces)==0)
print('loose edges:', degen2)
me = bpy.data.meshes.new('CarBody'); bm.to_mesh(me); bm.free()
body = bpy.data.objects.new('CarBody', me); bpy.context.collection.objects.link(body)
print('verts', len(me.vertices), 'polys', len(me.polygons))
