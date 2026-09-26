import bpy, bmesh, math, os
from mathutils import Vector

# ---------- helpers ----------
def fresh_scene():
    bpy.ops.object.select_all(action='SELECT')
    if bpy.context.selected_objects: bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for b in list(list(coll)):
            if b.users == 0: coll.remove(b)

MATS = {}
def mat(name, color, metal=0.0, rough=0.5, emis=None, emis_str=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emis:
        b.inputs['Emission Color'].default_value = (*emis, 1)
        b.inputs['Emission Strength'].default_value = emis_str
    if alpha < 1.0:
        m.blend_method = 'BLEND'; b.inputs['Alpha'].default_value = alpha
    MATS[name] = m
    return m

def build_mats():
    mat('PaintBody', (0.36,0.02,0.03), 0.92, 0.22)
    mat('TrimDark',  (0.015,0.015,0.018), 0.3, 0.45)
    mat('GlassCar', (0.012,0.015,0.022), 0.6, 0.04, alpha=0.5)
    mat('TireR',    (0.012,0.012,0.014), 0.0, 0.9)
    mat('RimSilver',(0.75,0.76,0.78), 1.0, 0.18)
    mat('RimLip',   (0.85,0.85,0.88), 1.0, 0.10)
    mat('Caliper',  (0.85,0.22,0.02), 0.4, 0.35, (0.5,0.1,0.0), 0.4)
    mat('BrakeDisc',(0.30,0.30,0.32), 1.0, 0.5)
    mat('Headlight',(0.9,0.9,0.85), 0.0, 0.1, (1.0,0.95,0.85), 4.0)
    mat('Taillight',(0.6,0.02,0.02), 0.0, 0.2, (1.0,0.03,0.02), 3.5)
    mat('PortDark', (0.01,0.01,0.012), 0.3, 0.3)
    mat('LEDDot',   (0.1,1.0,0.4), 0.0, 0.3, (0.1,1.0,0.4), 5.0)
    mat('Seat',     (0.06,0.06,0.07), 0.0, 0.8)
    mat('Chrome',   (0.88,0.88,0.9), 1.0, 0.08)
    mat('WhiteWall',(0.82,0.80,0.74), 0.0, 0.55)

SEG, EXP = 24, 3.5
def se(a, hw, hz, cz):
    c, s = math.cos(a), math.sin(a)
    return hw*math.copysign(abs(c)**(2.0/EXP), c), cz + hz*math.copysign(abs(s)**(2.0/EXP), s)

def loft(name, stations, material, exp=EXP):
    global EXP
    old = EXP; EXP = exp
    bm = bmesh.new(); rings=[]
    for (x, ztop, zbot, hw) in stations:
        cz, hz = (ztop+zbot)/2, (ztop-zbot)/2
        ring=[bm.verts.new((x, *se(2*math.pi*s/SEG, hw, hz, cz))) for s in range(SEG)]
        rings.append(ring)
    for ri in range(len(rings)-1):
        a, b = rings[ri], rings[ri+1]
        for s in range(SEG):
            t=(s+1)%SEG; bm.faces.new((a[s],a[t],b[t],b[s]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me=bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o=bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    EXP = old
    return o

def cyl(name, r, depth, loc, material, rot=(0,0,0), verts=28):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o=bpy.context.object; o.name=name
    if material: o.data.materials.append(material)
    return o
def box(name, sx, sy, sz, loc, material, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc, rotation=rot)
    o=bpy.context.object; o.name=name; o.scale=(sx/2, sy/2, sz/2)
    if material: o.data.materials.append(material)
    return o
def torus(name, R, r, loc, material, rot=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot, major_segments=36, minor_segments=10)
    o=bpy.context.object; o.name=name
    if material: o.data.materials.append(material)
    return o

YW=(math.pi/2,0,0)
def wheel_set(tag, wx, sgn, wr, ww, spec):
    wo = (0.90 - ww/2 - 0.02)*sgn
    mTire=MATS['TireR']; mRim=MATS['RimSilver']; mLip=MATS['RimLip']
    cyl(f'Tire{tag}', wr, ww, (wx, wo, wr), mTire, rot=YW, verts=44)
    if spec.get('whitewall'):
        torus(f'WW{tag}', wr*0.80, ww*0.16, (wx, wo+sgn*ww*0.5, wr), MATS['WhiteWall'], YW)
    cyl(f'Dish{tag}', wr*0.68, 0.02, (wx, wo+sgn*(ww/2-0.01), wr), mRim, rot=YW, verts=36)
    torus(f'Lip{tag}', wr*0.72, 0.02, (wx, wo+sgn*ww*0.5, wr), mLip, YW)
    cyl(f'Disc{tag}', wr*0.60, 0.02, (wx, wo-sgn*0.01, wr), MATS['BrakeDisc'], rot=YW, verts=32)
    cyl(f'Hub{tag}', 0.06, ww+0.04, (wx, wo, wr), mRim, rot=YW)
    cyl(f'Caliper{tag}', 0.05, 0.10, (wx+wr*0.4, wo-sgn*0.02, wr), MATS['Caliper'], rot=YW, verts=14)
    n = spec.get('spokes', 5)
    for s in range(n):
        a=s*2*math.pi/n + math.pi/8
        box(f'Spoke{tag}_{s}', wr*0.72, 0.05, 0.05,
            (wx + wr*0.36*math.cos(a), wo+sgn*(ww*0.5+0.012), wr + wr*0.36*math.sin(a)),
            mRim, rot=(0, -a, 0))

def interior(tag, GST):
    # dark cabin + seats through glass
    cab = loft(f'Cabin{tag}', [(x, ztop-0.06, ztop-0.46, hw-0.03) for (x,ztop,hw) in GST], MATS['TrimDark'])
    zs=[z for (_,z,_) in GST]; xs=[x for (x,_,_) in GST]
    dashz=max(zs)-0.42; front=max(xs)
    box(f'Dash{tag}', 0.70, 1.00, 0.10, (front-0.35, 0, dashz+0.06), MATS['Seat'], rot=(0,-0.25,0))
    box(f'Wheel{tag}', 0.05, 0.30, 0.30, (front-0.55, 0.34, dashz+0.14), MATS['Seat'], rot=(0,0.3,0))
    for sy in (0.36,-0.36):
        box(f'SeatF{sy}', 0.40, 0.44, 0.07, (front-0.85, sy, dashz), MATS['Seat'])
        box(f'SeatFb{sy}', 0.07, 0.44, 0.40, (front-1.05, sy, dashz+0.18), MATS['Seat'], rot=(0,0.15,0))
        if min(xs) < -1.6:
            box(f'SeatR{sy}', 0.40, 0.44, 0.07, (min(xs)+0.55, sy, dashz), MATS['Seat'])
            box(f'SeatRb{sy}', 0.07, 0.44, 0.36, (min(xs)+0.37, sy, dashz+0.16), MATS['Seat'], rot=(0,0.12,0))

def charge_port(tag, px, pz, hw):
    cyl(f'ChargePort{tag}', 0.09, 0.10, (px, hw-0.05, pz), MATS['PortDark'], rot=YW)
    cyl(f'ChargePortRing{tag}', 0.115, 0.02, (px, hw+0.002, pz), MATS['TrimDark'], rot=YW)
    cyl(f'PortLED{tag}', 0.012, 0.018, (px+0.16, hw+0.006, pz), MATS['LEDDot'], rot=YW, verts=8)

def add_studio():
    world=bpy.data.worlds.get('World') or bpy.data.worlds.new('World'); world.use_nodes=True
    bg=world.node_tree.nodes.get('Background'); bg.inputs[0].default_value=(0.42,0.44,0.48,1); bg.inputs[1].default_value=0.7
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0,0,0))
    g=bpy.context.object; g.name='Gnd'
    gm=bpy.data.materials.new('GndMat'); gm.use_nodes=True
    gb=gm.node_tree.nodes.get('Principled BSDF')
    gb.inputs['Base Color'].default_value=(0.14,0.14,0.15,1); gb.inputs['Roughness'].default_value=0.3; gb.inputs['Metallic'].default_value=0.1
    g.data.materials.append(gm)
    def light(n,k,loc,e,size=3,rot=(0,0,0)):
        ld=bpy.data.lights.new(n,k); ld.energy=e
        if k=='AREA': ld.size=size
        o=bpy.data.objects.new(n,ld); o.location=loc; o.rotation_euler=rot
        bpy.context.collection.objects.link(o)
    light('Key','AREA',(4.5,-4.5,5),900,5,(math.radians(50),0,math.radians(45)))
    light('Rim','AREA',(-5.5,3.5,3.5),500,4,(math.radians(65),0,math.radians(-125)))
    light('Fill','AREA',(1.5,6,2.5),250,6,(math.radians(75),0,math.radians(160)))
    scene=bpy.context.scene
    try: scene.render.engine='BLENDER_EEVEE_NEXT'
    except Exception: scene.render.engine='BLENDER_EEVEE'
    scene.view_settings.view_transform='AgX'
    scene.render.resolution_x=1100; scene.render.resolution_y=620
    try: scene.eevee.taa_render_samples=48
    except Exception: pass

def render_and_export(prefix, tag):
    from mathutils import Vector as V
    out_dir='/home/lex/chargebay/progress/artifacts'
    scene=bpy.context.scene
    for nm,cp,tp in [('side',(-8.6,5.6,0.55),(-0.2,0,0.45)),('front',(7.6,3.4,0.50),(0.2,0,0.42))]:
        cd=bpy.data.cameras.new('Cam'); cam=bpy.data.objects.new('Cam',cd)
        bpy.context.collection.objects.link(cam)
        cam.location=cp; d=V(tp)-V(cp); cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
        scene.camera=cam; scene.render.filepath=f'{out_dir}/{prefix}_{nm}.png'
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam,do_unlink=True); bpy.data.cameras.remove(cd)
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type=='MESH' and o.name!='Gnd': o.select_set(True)
    p=f'/home/lex/chargebay/assets/{tag}.glb'
    bpy.ops.export_scene.gltf(filepath=p, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
    print('EXPORTED', p, os.path.getsize(p))

def wbbox(o):
    deps=bpy.context.evaluated_depsgraph_get(); ev=o.evaluated_get(deps)
    cs=[ev.matrix_world @ Vector(c) for c in ev.bound_box]
    return (min(c.x for c in cs),max(c.x for c in cs),min(c.y for c in cs),max(c.y for c in cs),min(c.z for c in cs),max(c.z for c in cs))

# ================= SPEC: SUV =================
def build_suv():
    body=loft('CarBody', [
        ( 2.30, 0.78, 0.30, 0.54),( 2.10, 0.90, 0.28, 0.70),( 1.75, 1.00, 0.28, 0.84),
        ( 1.30, 1.06, 0.30, 0.92),( 0.90, 1.12, 0.30, 0.94),( 0.50, 1.44, 0.30, 0.94),
        ( 0.00, 1.74, 0.30, 0.92),(-0.60, 1.82, 0.30, 0.90),(-1.20, 1.80, 0.30, 0.90),
        (-1.70, 1.72, 0.30, 0.88),(-2.00, 1.58, 0.30, 0.84),(-2.20, 1.40, 0.28, 0.76),
        (-2.32, 1.24, 0.28, 0.62)], MATS['PaintBody'], exp=4.5)
    GST=[(0.95,1.16,0.88),(0.50,1.48,0.92),(0.00,1.76,0.92),(-0.60,1.84,0.90),(-1.20,1.82,0.90),(-1.75,1.74,0.86)]
    loft('Glass', [(x, ztop+0.012, ztop-0.42, hw+0.014) for (x,ztop,hw) in GST], MATS['GlassCar'])
    loft('RoofCap', [(x, ztop+0.03, ztop-0.08, hw-0.06) for (x,ztop,hw) in GST[1:-1]], MATS['PaintBody'])
    for sgn in (1,-1):
        box(f'APillar{sgn}', 0.055,0.02,0.70,(0.90,sgn*0.86,1.20),MATS['TrimDark'],rot=(0,0.28,0))
        box(f'CPillar{sgn}', 0.06,0.02,0.62,(-1.62,sgn*0.82,1.18),MATS['TrimDark'],rot=(0,-0.22,0))
        box(f'RoofRail{sgn}', 2.3,0.05,0.05,(-0.35,sgn*0.82,1.88),MATS['TrimDark'])
    box('RackCross1', 0.06,1.6,0.05,(-0.80,0,1.90),MATS['Chrome']); box('RackCross2', 0.06,1.6,0.05,(0.30,0,1.90),MATS['Chrome'])
    box('HeadL',0.14,0.50,0.09,(2.34,0.52,0.62),MATS['Headlight']); box('HeadR',0.14,0.50,0.09,(2.34,-0.52,0.62),MATS['Headlight'])
    box('TailBar',0.14,1.30,0.08,(-2.40,0,1.00),MATS['Taillight'])
    box('BumperF',0.16,1.55,0.26,(2.32,0,0.36),MATS['TrimDark']); box('BumperR',0.16,1.50,0.28,(-2.38,0,0.38),MATS['TrimDark'])
    box('SkirtL',1.6,0.06,0.12,(-0.1,0.88,0.26),MATS['TrimDark']); box('SkirtR',1.6,0.06,0.12,(-0.1,-0.88,0.26),MATS['TrimDark'])
    for sgn in (1,-1):
        box(f'MirStalk{sgn}',0.03,0.14,0.04,(0.80,sgn*0.92,1.14),MATS['TrimDark'])
        box(f'MirPod{sgn}',0.12,0.06,0.10,(0.78,sgn*1.02,1.12),MATS['TrimDark'])
    W=[(1.50,1),(1.50,-1),(-1.50,1),(-1.50,-1)]
    for k,(wx,s) in enumerate(W):
        wheel_set(f'_{k}', wx, s, 0.47, 0.34, {'spokes':6})
        torus(f'Arch{wx}_{s}', 0.56, 0.035, (wx, s*0.86, 0.47), MATS['TrimDark'], YW)
    box('CladL', 3.0, 0.05, 0.16, (-0.05, 0.90, 0.34), MATS['TrimDark'])
    box('CladR', 3.0, 0.05, 0.16, (-0.05,-0.90, 0.34), MATS['TrimDark'])
    interior('SUV', GST)
    charge_port('SUV', -0.70, 0.92, 0.92)
    return body

# ================= SPEC: VAN =================
def build_van():
    body=loft('CarBody', [
        ( 2.60, 0.84, 0.30, 0.58),( 2.40, 0.96, 0.28, 0.74),( 2.05, 1.06, 0.28, 0.88),
        ( 1.60, 1.14, 0.30, 0.94),( 1.30, 1.24, 0.30, 0.96),( 1.10, 1.94, 0.30, 0.97),
        ( 0.40, 2.16, 0.30, 0.98),(-0.60, 2.20, 0.30, 0.98),(-1.60, 2.16, 0.30, 0.98),
        (-2.30, 2.04, 0.28, 0.94),(-2.56, 1.76, 0.28, 0.84),(-2.70, 1.50, 0.26, 0.68)], MATS['PaintBody'], exp=4.0)
    GST=[(1.40,1.30,0.90),(1.15,1.96,0.94),(0.60,2.14,0.94),(-0.40,2.18,0.94)]
    loft('Glass', [(x, ztop+0.012, ztop-0.50, hw+0.014) for (x,ztop,hw) in GST], MATS['GlassCar'])
    loft('RoofCap', [(x, ztop+0.03, ztop-0.10, hw-0.05) for (x,ztop,hw) in GST[1:]], MATS['PaintBody'])
    for sgn in (1,-1):
        box(f'APillar{sgn}',0.06,0.02,0.75,(1.12,sgn*0.90,1.42),MATS['TrimDark'],rot=(0,0.20,0))
        box(f'BPillar{sgn}',0.05,0.02,0.80,(-0.10,sgn*0.94,1.55),MATS['TrimDark'])
    box('HeadL',0.14,0.54,0.10,(2.64,0.54,0.60),MATS['Headlight']); box('HeadR',0.14,0.54,0.10,(2.64,-0.54,0.60),MATS['Headlight'])
    box('TailL',0.10,0.16,0.90,(-2.72,0.62,1.10),MATS['Taillight']); box('TailR',0.10,0.16,0.90,(-2.72,-0.62,1.10),MATS['Taillight'])
    box('BumperF',0.18,1.70,0.30,(2.62,0,0.36),MATS['TrimDark']); box('BumperR',0.18,1.75,0.34,(-2.72,0,0.40),MATS['TrimDark'])
    box('SideWinL', 0.90,0.03,0.55,(0.90,0.955,1.62),MATS['GlassCar']); box('SideWinR', 0.90,0.03,0.55,(0.90,-0.955,1.62),MATS['GlassCar'])
    box('WinFrameL', 0.98,0.02,0.03,(0.90,0.965,1.91),MATS['TrimDark']); box('WinFrameR', 0.98,0.02,0.03,(0.90,-0.965,1.91),MATS['TrimDark'])
    box('PanelLineL',2.4,0.02,0.02,(-1.0,0.965,1.30),MATS['TrimDark']); box('PanelLineR',2.4,0.02,0.02,(-1.0,-0.965,1.30),MATS['TrimDark'])
    box('CargoDoorL',1.9,0.02,1.5,(-1.3,0.975,1.30),MATS['PaintBody']); box('CargoDoorR',1.9,0.02,1.5,(-1.3,-0.975,1.30),MATS['PaintBody'])
    for sgn in (1,-1):
        box(f'MirArm{sgn}',0.04,0.22,0.04,(1.05,sgn*1.00,1.30),MATS['TrimDark'])
        box(f'MirPod{sgn}',0.12,0.07,0.22,(1.02,sgn*1.10,1.28),MATS['TrimDark'])
    W=[(1.70,1),(1.70,-1),(-1.95,1),(-1.95,-1)]
    for k,(wx,s) in enumerate(W):
        wheel_set(f'_{k}', wx, s, 0.46, 0.32, {'spokes':5})
        torus(f'Arch{wx}_{s}', 0.54, 0.03, (wx, s*0.90, 0.46), MATS['TrimDark'], YW)
    interior('VAN', GST)
    charge_port('VAN', -1.20, 0.96, 0.96)
    return body

# ================= SPEC: RETRO =================
def build_retro():
    body=loft('CarBody', [
        ( 2.10, 0.52, 0.16, 0.44),( 1.90, 0.62, 0.14, 0.58),( 1.55, 0.70, 0.14, 0.72),
        ( 1.10, 0.76, 0.16, 0.80),( 0.60, 0.84, 0.16, 0.82),( 0.20, 1.02, 0.16, 0.80),
        (-0.30, 1.14, 0.16, 0.76),(-0.80, 1.10, 0.16, 0.72),(-1.20, 0.98, 0.16, 0.66),
        (-1.55, 0.84, 0.14, 0.58),(-1.80, 0.72, 0.14, 0.48),(-1.95, 0.62, 0.14, 0.38)], MATS['PaintBody'], exp=5.0)
    GST=[(0.35,1.04,0.74),(-0.10,1.16,0.72),(-0.55,1.12,0.68),(-0.95,1.00,0.62)]
    loft('Glass', [(x, ztop+0.012, ztop-0.32, hw+0.012) for (x,ztop,hw) in GST], MATS['GlassCar'], exp=5.0)
    loft('RoofCap', [(x, ztop+0.02, ztop-0.06, hw-0.05) for (x,ztop,hw) in GST], MATS['PaintBody'], exp=5.0)
    # chrome bumpers + round lights
    cyl('BumperF',0.05,1.60,(2.02,0,0.34),MATS['Chrome'],rot=YW)
    cyl('BumperR',0.05,1.50,(-1.90,0,0.36),MATS['Chrome'],rot=YW)
    for sgn in (1,-1):
        cyl(f'HdrL{sgn}',0.11,0.06,(1.98,sgn*0.42,0.52),MATS['Headlight'],rot=YW,verts=24)
        torus(f'HRim{sgn}',0.12,0.015,(1.99,sgn*0.42,0.52),MATS['Chrome'],YW)
        cyl(f'TlrL{sgn}',0.07,0.05,(-1.88,sgn*0.38,0.56),MATS['Taillight'],rot=YW,verts=20)
    for sgn in (1,-1):
        box(f'APillar{sgn}',0.05,0.02,0.50,(0.30,sgn*0.72,0.88),MATS['Chrome'],rot=(0,0.30,0))
        box(f'CPillar{sgn}',0.05,0.02,0.44,(-0.98,sgn*0.64,0.84),MATS['Chrome'],rot=(0,-0.28,0))
        box(f'MirPod{sgn}',0.09,0.05,0.07,(0.42,sgn*0.90,0.80),MATS['Chrome'])
    # chrome side strip
    box('StripL',1.8,0.02,0.03,(-0.1,0.80,0.42),MATS['Chrome']); box('StripR',1.8,0.02,0.03,(-0.1,-0.80,0.42),MATS['Chrome'])
    W=[(1.20,1),(1.20,-1),(-1.25,1),(-1.25,-1)]
    for k,(wx,s) in enumerate(W): wheel_set(f'_{k}', wx, s, 0.39, 0.26, {'spokes':8,'whitewall':True})
    interior('RETRO', GST)
    charge_port('RETRO', -0.50, 0.80, 0.80)
    return body

# ---------- generate all ----------
jobs=[('suv', build_suv, 'car_suv'), ('van', build_van, 'car_van'), ('retro', build_retro, 'car_retro')]
build_mats()
scene=bpy.context.scene
for tag, fn, outname in jobs:
    fresh_scene(); build_mats()
    body=fn()
    bb=wbbox(body)
    print(tag, 'bb x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % bb)
    add_studio()
    render_and_export('fleet_'+tag, outname)
print('FLEET DONE')
