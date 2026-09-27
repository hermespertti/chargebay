# big-rig EV truck for chargebay: sleeper cab + box trailer, low-poly, port at cab rear
import bpy, bmesh, math
from mathutils import Vector

def mat(name, color, metal=0.0, rough=0.5, emis=None, emis_str=0.0, alpha=1.0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    bsdf=m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Metallic'].default_value=metal
    bsdf.inputs['Roughness'].default_value=rough
    if alpha<1:
        bsdf.inputs['Alpha'].default_value=alpha
        m.blend_method='BLEND'
    if emis:
        bsdf.inputs['Emission Color'].default_value=(*emis,1)
        bsdf.inputs['Emission Strength'].default_value=emis_str
    return m

bm=bmesh.new()

def box(bm, cx,cy,cz, sx,sy,sz):
    res=bmesh.ops.create_cube(bm,size=1.0)
    verts=res['verts']
    bmesh.ops.scale(bm,verts=verts,vec=(sx,sy,sz))
    bmesh.ops.translate(bm,verts=verts,vec=(cx,cy,cz))
    return verts

# ---- dimensions (x = length, ~9 m rig) ----
# frame rails
box(bm, 0, 0, 0.55, 9.0, 2.0, 0.18)
# sleeper cab body
box(bm, -3.15, 0, 1.65, 2.7, 2.45, 1.9)
# sleeper bunk bump-out at rear of cab
box(bm, -1.62, 0, 1.35, 0.5, 2.3, 1.0)
# hood/nose (conventional-ish)
box(bm, -4.85, 0, 1.15, 1.5, 2.4, 1.1)
# grille
box(bm, -5.62, 0, 1.05, 0.12, 2.0, 0.75)
# roof fairing / air deflector over cab
box(bm, -3.4, 0, 2.78, 2.2, 2.2, 0.35)
# mirrors (thin arms out both sides)
box(bm, -4.7,  1.38, 2.1, 0.5, 0.06, 0.5)
box(bm, -4.7, -1.38, 2.1, 0.5, 0.06, 0.5)
# box trailer
box(bm, 2.1, 0, 1.95, 5.6, 2.6, 2.7)
# trailer skirt
box(bm, 2.1, 0, 0.55, 5.4, 2.5, 0.45)
# rear door frame
box(bm, 4.92, 0, 1.95, 0.08, 2.4, 2.5)
# fifth-wheel coupling plate
box(bm, -0.9, 0, 0.72, 1.4, 1.6, 0.12)

# ---- materials assignment by region ----
m_body=mat('TruckPaint',(0.85,0.12,0.10),0.6,0.28)
m_box=mat('TrailerBox',(0.92,0.93,0.95),0.3,0.4)
m_dark=mat('TruckDark',(0.05,0.05,0.06),0.2,0.6)
m_chrome=mat('TruckChrome',(0.75,0.78,0.82),1.0,0.15)
m_glass=mat('TruckGlass',(0.12,0.16,0.20),0.4,0.08, emis=(0.3,0.45,0.6), emis_str=0.25, alpha=0.55)
m_lamp=mat('TruckLamp',(1.0,0.85,0.5),0.0,0.3, emis=(1.0,0.8,0.4), emis_str=2.2)
m_tail=mat('TruckTail',(1.0,0.1,0.05),0.0,0.3, emis=(1.0,0.08,0.03), emis_str=2.0)
m_port=mat('ChargePort',(0.15,0.85,0.55),0.5,0.3, emis=(0.15,0.9,0.6), emis_str=1.4)
m_wheel=mat('TruckTire',(0.03,0.03,0.035),0.0,0.85)
m_hub=mat('TruckHub',(0.7,0.72,0.75),1.0,0.25)

me=bpy.data.meshes.new('TruckRig')
bm.to_mesh(me); bm.free()
obj=bpy.data.objects.new('TruckRig', me)
bpy.context.collection.objects.link(obj)

# split materials: assign faces by z/position heuristics after rebuild per-part instead:
# simpler approach — rebuild as separate meshes per part to own materials cleanly
bpy.data.objects.remove(obj, do_unlink=True)

parts=[]
def part(name, cx,cy,cz, sx,sy,sz, material):
    b=mesh=bmesh.new()
    box(b, cx,cy,cz, sx,sy,sz)
    m=bpy.data.meshes.new(name); b.to_mesh(m); b.free()
    o=bpy.data.objects.new(name, m); bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    parts.append(o)
    return o

# clear first scene attempt artifacts
for nm in ['TruckPaint','TrailerBox','TruckDark','TruckChrome','TruckGlass','TruckLamp','TruckTail','ChargePort','TruckTire','TruckHub']:
    pass

for o in list(bpy.data.objects):
    if o.type=='MESH' and o.name.startswith(('FrameRails','Cab','Sleeper','Hood')):
        bpy.data.objects.remove(o, do_unlink=True)

part('FrameRails', 0,0,0.55, 9.0,2.0,0.18, m_dark)
part('CabBody',   -3.15,0,1.65, 2.7,2.45,1.9, m_body)
part('Sleeper',   -1.62,0,1.35, 0.5,2.3,1.0, m_body)
part('Hood',      -4.85,0,1.15, 1.5,2.4,1.1, m_body)
part('Grille',    -5.62,0,1.05, 0.12,2.0,0.75, m_chrome)
part('Fairing',   -3.4,0,2.78, 2.2,2.2,0.35, m_body)
part('MirrorL',   -4.7,1.38,2.1, 0.5,0.06,0.5, m_dark)
part('MirrorR',   -4.7,-1.38,2.1, 0.5,0.06,0.5, m_dark)
part('Trailer',    2.1,0,1.95, 5.6,2.6,2.7, m_box)
part('Skirt',      2.1,0,0.55, 5.4,2.5,0.45, m_dark)
part('RearDoor',   4.92,0,1.95, 0.08,2.4,2.5, m_box)
part('FifthWheel',-0.9,0,0.72, 1.4,1.6,0.12, m_chrome)

# windshield + side windows (glass, slightly inset panels)
part('Windshield', -4.62,0,2.05, 0.06,2.15,0.95, m_glass)
part('SideGlassL', -3.15,1.235,2.0, 1.6,0.05,0.8, m_glass)
part('SideGlassR', -3.15,-1.235,2.0, 1.6,0.05,0.8, m_glass)

# head lamps
part('HeadLampL', -5.6, 0.85,0.95, 0.08,0.4,0.22, m_lamp)
part('HeadLampR', -5.6,-0.85,0.95, 0.08,0.4,0.22, m_lamp)
# marker lights along trailer top edge (classic rig lights)
for i,tx in enumerate([-1.2,-0.2,0.8,1.8,2.8,3.8,4.6]):
    part(f'MarkerL{i}', tx, 1.28, 3.22, 0.12,0.06,0.06, m_lamp)
# tail lights
part('TailL', 4.96, 0.95,0.95, 0.06,0.35,0.22, m_tail)
part('TailR', 4.96,-0.95,0.95, 0.06,0.35,0.22, m_tail)

# charge port on cab right rear (game bay-side, +x rear trailer edge instead -> place on trailer front right for plug reach)
part('ChargePortBox', -1.28, -1.32, 1.1, 0.10, 0.06, 0.5, m_port)
part('ChargePortRing', -1.36, -1.32, 1.1, 0.05, 0.05, 0.34, m_chrome)

# wheels: 3 axles (1 steer + tandem drive on cab, single trailer axle... classic 5-wheel look: front, two mid, two rear)
def wheel(name, wx, wy, wr=0.52, wid=0.30):
    b=bmesh.new()
    res=bmesh.ops.create_cone(b, cap_ends=True, segments=16, radius1=wr, radius2=wr, depth=wid)
    bmesh.ops.rotate(b, verts=res['verts'], cent=(0,0,0), matrix=__import__('mathutils').Matrix.Rotation(math.pi/2,3,'Y'))
    msh=bpy.data.meshes.new(name); b.to_mesh(msh); b.free()
    o=bpy.data.objects.new(name, msh); bpy.context.collection.objects.link(o)
    o.location=(wx, wy, wr)
    o.data.materials.append(m_wheel)
    # hub
    b2=bmesh.new()
    r2=bmesh.ops.create_cone(b2, cap_ends=True, segments=8, radius1=wr*0.45, radius2=wr*0.45, depth=wid+0.04)
    bmesh.ops.rotate(b2, verts=r2['verts'], cent=(0,0,0), matrix=__import__('mathutils').Matrix.Rotation(math.pi/2,3,'Y'))
    msh2=bpy.data.meshes.new(name+'_hub'); b2.to_mesh(msh2); b2.free()
    o2=bpy.data.objects.new(name+'_hub', msh2); bpy.context.collection.objects.link(o2)
    o2.location=(wx, wy, wr); o2.data.materials.append(m_hub)
    return o, o2

wheels=[]
for i,(wx,wy) in enumerate([(-4.55,1.15),(-4.55,-1.15),(-0.95,1.15),(-0.95,-1.15),(3.0,1.15),(3.0,-1.15)]):
    wheels.extend(wheel(f'Wheel{i}', wx, wy))

# join all into one object
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o.type=='MESH' and (o.name.startswith(('FrameRails','Cab','Sleeper','Hood','Grille','Fairing','Mirror','Trailer','Skirt','RearDoor','FifthWheel','Windshield','SideGlass','HeadLamp','MarkerL','TailL','TailR','ChargePort','Wheel'))):
        o.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects['CabBody']
bpy.ops.object.join()
rig=bpy.context.view_layer.objects.active
rig.name='TruckRig'
import mathutils
rig.rotation_euler=(0,0,math.pi/2)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.object.transform_apply(rotation=True)
zs=[ (rig.matrix_world @ v.co).z for v in rig.data.vertices ]
rig.location.z -= min(zs)
bpy.context.view_layer.update()
bbmin=[ (rig.matrix_world @ __import__('mathutils').Vector(v)).to_tuple() for v in [] ]
xs=[ (rig.matrix_world @ v.co).x for v in rig.data.vertices ]
ys=[ (rig.matrix_world @ v.co).y for v in rig.data.vertices ]
xs=[ (rig.matrix_world @ v.co).x for v in rig.data.vertices ]
# centered horizontally, length along Y
cx=(min(xs)+max(xs))/2; cy=(min(ys)+max(ys))/2
rig.location.x -= cx; rig.location.y -= cy
bpy.context.view_layer.update()
# port: Blender(-1.32,-1.32,1.1) -> after rot z+90: (x,y)=(-1.32,-1.32)->(y=?) ; compute by transforming point
Pp=__import__('mathutils').Vector((-1.32,-1.32,1.1))
# apply same rot z+90 then floor/center shift
R=__import__('mathutils').Matrix.Rotation(math.pi/2,3,'Z')
P=R @ Pp
zsfloor=min((R @ v.co).z for v in rig.data.vertices)
Pz=P.z - zsfloor
# center: cx,cy were from rotated verts
xs2=[ (R @ v.co).x for v in rig.data.vertices ]; ys2=[ (R @ v.co).y for v in rig.data.vertices ]
cx2=(min(xs2)+max(xs2))/2; cy2=(min(ys2)+max(ys2))/2
port=[round(P.x-cx2,2), round(Pz,2), round(P.y-cy2,2)]
rig['protoPort']=port
print('truck port (glTF local):', port)

# export
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.ops.export_scene.gltf(filepath='/home/lex/chargebay/assets/car_truck.glb', export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('exported car_truck.glb; objects in join:', len(rig.data.polygons), 'polys')
