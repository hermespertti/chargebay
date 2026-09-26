import bpy, bmesh, math, os
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for x in list(coll): coll.remove(x)

def mat(name, col, rough=0.8, metal=0.0, emis=None, emis_str=0.0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    b=m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value=(*col,1)
    b.inputs['Roughness'].default_value=rough
    b.inputs['Metallic'].default_value=metal
    if emis:
        b.inputs['Emission Color'].default_value=(*emis,1)
        b.inputs['Emission Strength'].default_value=emis_str
    return m

mTrunk=mat('Bark',(0.16,0.11,0.07),0.95)
mFoliage=mat('Foliage',(0.10,0.26,0.12),0.9)
mFoliage2=mat('FoliageDark',(0.07,0.19,0.09),0.9)
mWood=mat('BenchWood',(0.32,0.22,0.13),0.8)
mSteel=mat('Steel',(0.35,0.37,0.40),0.4,0.9)
mBin=mat('BinGreen',(0.10,0.22,0.14),0.6,0.1)
mStripe=mat('BollardStripe',(0.75,0.55,0.10),0.5,0.3, emis=(0.9,0.6,0.15), emis_str=0.6)

def box(name,sx,sy,sz,loc,mt,rot=None):
    mesh=bpy.data.meshes.new(name); bm=bmesh.new()
    bmesh.ops.create_cube(bm,size=1.0)
    for v in bm.verts:
        v.co.x*=sx; v.co.y*=sy; v.co.z*=sz
    bm.to_mesh(mesh); bm.free()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    o.location=loc
    if rot: o.rotation_euler=rot
    o.data.materials.append(mt); return o

def cone(name,r1,r2,depth,loc,mt,verts=10):
    mesh=bpy.data.meshes.new(name); bm=bmesh.new()
    bmesh.ops.create_cone(bm,cap_ends=True,segments=verts,radius1=r1,radius2=r2,depth=depth)
    bm.to_mesh(mesh); bm.free()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    o.location=loc
    o.data.materials.append(mt); return o

def cyl(name,r,depth,loc,mt,verts=12):
    mesh=bpy.data.meshes.new(name); bm=bmesh.new()
    bmesh.ops.create_cone(bm,cap_ends=True,segments=verts,radius1=r,radius2=r,depth=depth)
    bm.to_mesh(mesh); bm.free()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    o.location=loc
    o.data.materials.append(mt); return o

# ---------- LOW TREE (~3.5m): trunk + 3 stacked irregular canopy cones ----------
tree_parts=[]
tree_parts.append(cyl('LT_Trunk',0.09,1.6,(0,0,0.8),mTrunk,8))
tree_parts.append(cone('LT_C1',0.95,0.55,1.5,(0,0,1.9),mFoliage,9))
tree_parts.append(cone('LT_C2',0.72,0.40,1.3,(0.10,0.05,2.7),mFoliage2,9))
tree_parts.append(cone('LT_C3',0.45,0.05,1.0,(-0.05,0.02,3.4),mFoliage,8))
for p in tree_parts[1:]: p.name='Wind_'+p.name   # mark canopy for wind sway

# ---------- ROUND SHRUB: cluster of icospheres ----------
shrub_parts=[]
import random
random.seed(7)
for i,(dx,dy,r) in enumerate([(0,0,0.34),(0.28,0.1,0.24),(-0.24,0.12,0.26),(0.05,-0.26,0.22),(-0.1,-0.2,0.18)]):
    mesh=bpy.data.meshes.new('Shrub%d'%i); bm=bmesh.new()
    bmesh.ops.create_icosphere(bm,subdivisions=1,radius=r)
    bm.to_mesh(mesh); bm.free()
    o=bpy.data.objects.new(('Wind_Shrub%d'%i) if i else 'Shrub%d'%i,mesh)
    bpy.context.collection.objects.link(o)
    o.location=(dx,dy,r*0.85)
    o.data.materials.append(mFoliage if i%2 else mFoliage2)
    shrub_parts.append(o)

# ---------- BENCH: slatted seat + back on steel legs ----------
bench_parts=[]
# deeper seat, taller prominent back, chunkier slats so it reads at dusk scale
for i in range(5):
    bench_parts.append(box('BenchSeat%d'%i,1.5,0.20,0.06,(0,-0.30+i*0.21,0.48),mWood))
for i in range(4):
    bench_parts.append(box('BenchBack%d'%i,1.5,0.06,0.18,(0,-0.56,0.68+i*0.22),mWood,rot=(0.10,0,0)))
bench_parts.append(box('BenchLegL',0.08,0.6,0.48,(-0.62,0,0.24),mSteel))
bench_parts.append(box('BenchLegR',0.08,0.6,0.48,(0.62,0,0.24),mSteel))
bench_parts.append(box('BenchArmL',0.07,0.62,0.07,(-0.72,0.02,0.66),mSteel))
bench_parts.append(box('BenchArmR',0.07,0.62,0.07,(0.72,0.02,0.66),mSteel))
bench_parts.append(box('BenchBackPostL',0.06,0.06,0.95,(-0.66,-0.52,0.48),mSteel,rot=(0.10,0,0)))
bench_parts.append(box('BenchBackPostR',0.06,0.06,0.95,(0.66,-0.52,0.48),mSteel,rot=(0.10,0,0)))

# ---------- TRASH BIN: tapered drum + rim + lid ----------
bin_parts=[]
bin_parts.append(cone('BinBody',0.22,0.18,0.62,(0,0,0.31),mBin,12))
bin_parts.append(cyl('BinRim',0.235,0.06,(0,0,0.65),mSteel,12))
bin_parts.append(cone('BinLid',0.20,0.10,0.09,(0,0,0.72),mSteel,12))   # domed lid reads as bin
bin_parts.append(cyl('BinPost',0.02,0.1,(0.2,0,0.66),mSteel,8))          # side hinge cue

# ---------- BOLLARD: steel post + reflective band ----------
boll_parts=[]
boll_parts.append(cyl('BollPost',0.05,0.9,(0,0,0.45),mSteel,10))
boll_parts.append(cyl('BollBand',0.055,0.12,(0,0,0.72),mStripe,10))
boll_parts.append(cyl('BollCap',0.05,0.04,(0,0,0.92),mSteel,10))

def join(parts,name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    o=bpy.context.view_layer.objects.active; o.name=name; o.data.name=name
    return o

t=join(tree_parts,'TreeLow'); s=join(shrub_parts,'ShrubLow'); bn=join(bench_parts,'Bench'); bi=join(bin_parts,'TrashBin'); bo=join(boll_parts,'Bollard')

# keep loose canopy geometry named Wind_ in the tree via vertex groups proxy: instead mark entire tree mesh; game sways whole TreeLow mildly.
os.makedirs('/home/lex/chargebay/assets',exist_ok=True)
out='/home/lex/chargebay/assets/scenery.glb'
bpy.ops.object.select_all(action='DESELECT')
for o in (t,s,bn,bi,bo): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out,use_selection=True,export_format='GLB',export_yup=True,export_apply=True)
print('exported',out,os.path.getsize(out))
