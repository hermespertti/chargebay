import bpy
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath='/home/lex/chargebay/assets/plug.glb')

for o in bpy.context.scene.objects:
    if o.type != 'MESH':
        continue
    print('OBJ', o.name)
    mw = o.matrix_world
    me = o.data
    per_mat = {mi: [] for mi in range(len(me.materials))}
    for p in me.polygons:
        for vi in p.vertices:          # vi is an int index
            per_mat[p.material_index].append(mw @ me.vertices[vi].co)
    for mi, pts in per_mat.items():
        if not pts:
            print('  mat', mi, 'no verts'); continue
        mname = me.materials[mi].name if mi < len(me.materials) else str(mi)
        xs = [c.x for c in pts]; ys = [c.y for c in pts]; zs = [c.z for c in pts]
        print('  mat', mname,
              'x', round(min(xs),3), round(max(xs),3),
              'y', round(min(ys),3), round(max(ys),3),
              'z', round(min(zs),3), round(max(zs),3))
