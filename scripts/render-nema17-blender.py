"""Original, procedural NEMA17 illustration (millimetres), not a vendor CAD model.

Run: blender -b --python scripts/render-nema17-blender.py
The exported GLB and the reference use the SAME evaluated meshes/materials.
Blender Z-up -> glTF Y-up: (x,y,z) -> (x,z,-y).
"""
import bpy, json, math, pathlib, hashlib
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/fixtures/nema17'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metal, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m

aluminium = material('Machined aluminium', (.56,.59,.63), 1, .28)
steel = material('Steel shaft', (.52,.55,.58), 1, .19)
black = material('Dark coated laminations', (.025,.028,.033), .25, .42)
groove = material('Lamination seams', (.011,.012,.014), .15, .55)
bolts = material('Dark steel screws', (.085,.09,.10), .9, .31)
rubber = material('Cable boot', (.015,.016,.019), 0, .6)
floor = material('Studio floor', (.72,.74,.78), 0, .65)

def finish(obj, mat, bevel=0, smooth=False):
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Manufactured edge bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for face in obj.data.polygons:
        face.use_smooth = smooth
    if smooth:
        mod = obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def plate(name, z, depth, mat, bevel=.3, half=21.15, cut=4):
    a, b = half, half-cut
    outline = [(-b,-a),(b,-a),(a,-b),(a,b),(b,a),(-b,a),(-a,b),(-a,-b)]
    vertices = [(x,y,z+dz) for dz in (0,depth) for x,y in outline]
    faces = [tuple(reversed(range(8))), tuple(range(8,16))]
    faces += [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, mat, bevel, True)

def cylinder(name, radius, depth, z, mat, xy=(0,0), bevel=.12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=radius, depth=depth, location=(*xy,z))
    obj = bpy.context.object
    obj.name = name
    return finish(obj, mat, bevel, True)

def drill(obj, xy, radius, z, depth):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=(*xy,z))
    cutter = bpy.context.object
    mod = obj.modifiers.new('Mounting hole', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

plate('Rear end cap',0,7,aluminium)
plate('Laminated stator body',7,27,black, .35)
for i in range(26):
    plate('Lamination seam %02d'%i,7.65+i,.10,groove,.025,21.18,4.05)
front = plate('Front mounting plate',34,6,aluminium,.4)
for x in (-15.5,15.5):
    for y in (-15.5,15.5):
        drill(front,(x,y),1.5,37,9)
        drill(front,(x,y),1.75,39.9,.45)
for x in (-17,17):
    for y in (-11.5,11.5):
        drill(front,(x,y),2,39.5,1.6)
        cylinder('Assembly screw',1.75,.7,39.15,bolts,(x,y),.1)
        # Recessed cross slots cut into the head.
        screw = bpy.context.object
        for angle in (0,math.pi/2):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x,y,39.53))
            cutter = bpy.context.object
            cutter.scale = (2.35,.38,.38)
            cutter.rotation_euler.z = angle
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            mod = screw.modifiers.new('Screw slot','BOOLEAN')
            mod.object = cutter
            mod.operation = 'DIFFERENCE'
            bpy.context.view_layer.objects.active = screw
            bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.data.objects.remove(cutter, do_unlink=True)
cylinder('22 mm locating boss',11,2,41,aluminium,bevel=.18)
cylinder('Bearing seal',4.3,.3,42.12,bolts,bevel=.05)
cylinder('Bearing inner ring',3.45,.4,42.35,steel,bevel=.06)
shaft = cylinder('5 mm D shaft',2.5,23.5,53.95,steel,bevel=.14)
bpy.ops.mesh.primitive_cube_add(size=1,location=(4.5,0,58))
cutter = bpy.context.object
cutter.scale=(5,10,19)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
mod=shaft.modifiers.new('Shaft flat','BOOLEAN')
mod.object=cutter
mod.operation='DIFFERENCE'
bpy.context.view_layer.objects.active=shaft
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(cutter,do_unlink=True)

# Four insulated leads on the rear side.
colors=[(.28,.015,.01),(.01,.025,.12),(.025,.13,.025),(.012,.012,.014)]
for i,color in enumerate(colors):
    mat=material('Insulated lead %d'%i,color,0,.4)
    curve=bpy.data.curves.new('Lead','CURVE')
    curve.dimensions='3D'
    curve.bevel_depth=.65
    curve.bevel_resolution=3
    spline=curve.splines.new('BEZIER')
    spline.bezier_points.add(3)
    for p,co in zip(spline.bezier_points,[(20,-3+i*1.6,4),(27,-3+i*1.6,3),(33,-6+i*1.6,1),(39,-13+i*1.6,1)]):
        p.co=co
        p.handle_left_type='AUTO'
        p.handle_right_type='AUTO'
    obj=bpy.data.objects.new('Motor lead %d'%i,curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)

bpy.ops.mesh.primitive_plane_add(size=1000,location=(0,0,-.15))
bpy.context.object.name='Shadow receiving floor'
finish(bpy.context.object,floor)

# World-space analytic spherical Gaussian softboxes, shared with PoppyGL.
env=json.loads((ROOT/'lib/render/studio-environment.json').read_text())
world=bpy.data.worlds.new('Shared analytic studio')
world.use_nodes=True
bpy.context.scene.world=world
nodes=world.node_tree.nodes
links=world.node_tree.links
nodes.clear()
geom=nodes.new('ShaderNodeNewGeometry')
neg=nodes.new('ShaderNodeVectorMath')
neg.operation='SCALE'
neg.inputs[3].default_value=-1
links.new(geom.outputs['Incoming'],neg.inputs[0])
color=nodes.new('ShaderNodeRGB')
color.outputs[0].default_value=(*env['ambient'],1)
last=color.outputs[0]
for lobe in env['lobes']:
    d=Vector(lobe['direction']).normalized()
    # Inverse of Blender Z-up -> glTF Y-up export.
    direction=(d.x,-d.z,d.y)
    dot=nodes.new('ShaderNodeVectorMath')
    dot.operation='DOT_PRODUCT'
    dot.inputs[1].default_value=direction
    links.new(neg.outputs['Vector'],dot.inputs[0])
    subtract=nodes.new('ShaderNodeMath'); subtract.operation='SUBTRACT'
    subtract.inputs[1].default_value=1
    links.new(dot.outputs['Value'],subtract.inputs[0])
    mult=nodes.new('ShaderNodeMath'); mult.operation='MULTIPLY'
    mult.inputs[1].default_value=lobe['sharpness']
    links.new(subtract.outputs[0],mult.inputs[0])
    exp=nodes.new('ShaderNodeMath'); exp.operation='EXPONENT'
    links.new(mult.outputs[0],exp.inputs[0])
    scale=nodes.new('ShaderNodeVectorMath'); scale.operation='SCALE'
    scale.inputs[0].default_value=lobe['color']
    links.new(exp.outputs[0],scale.inputs[3])
    add=nodes.new('ShaderNodeVectorMath'); add.operation='ADD'
    links.new(last,add.inputs[0]); links.new(scale.outputs[0],add.inputs[1])
    last=add.outputs[0]
bg=nodes.new('ShaderNodeBackground')
links.new(last,bg.inputs['Color'])
output=nodes.new('ShaderNodeOutputWorld')
links.new(bg.outputs[0],output.inputs[0])

scene=bpy.context.scene
bpy.ops.object.camera_add(location=(102,-136,115))
camera=bpy.context.object
target=Vector((0,0,28))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='PERSP'
camera.data.lens=50
camera.data.sensor_width=36
camera.data.sensor_fit='VERTICAL'
camera.data.clip_start=.1
camera.data.clip_end=1000
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.samples=512
scene.cycles.seed=0
scene.cycles.use_denoising=True
scene.cycles.max_bounces=8
scene.render.resolution_x=900
scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard'
scene.view_settings.look='None'
scene.view_settings.exposure=0
scene.view_settings.gamma=1

# Export only meshes, with modifiers applied; camera and world are specified separately.
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    if obj.type=='MESH': obj.select_set(True)
glb=OUT/'nema17.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=True,export_yup=True)
metadata={
    'blenderVersion':bpy.app.version_string,'engine':'CYCLES','samples':512,'seed':0,
    'denoising':True,'maxBounces':8,'viewTransform':'Standard','look':'None',
    'exposure':0,'gamma':1,'width':900,'height':900,
    'camPos':[102,115,136],'lookAt':[0,28,0],'up':'y+',
    'fov':math.degrees(camera.data.angle_y),
    'units':'millimetres','glbSha256':hashlib.sha256(glb.read_bytes()).hexdigest(),
    'environmentSha256':hashlib.sha256((ROOT/'lib/render/studio-environment.json').read_bytes()).hexdigest(),
    'model':'Original procedural 42.3 mm NEMA17 illustration; 31 mm mounting pitch; 5 mm D shaft. Not manufacturer CAD.'
}
(OUT/'reference.json').write_text(json.dumps(metadata,indent=2)+'\n')
scene.render.filepath='//blender-cycles.png'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'nema17.blend'))
bpy.ops.render.render(write_still=True)
metadata['referenceSha256']=hashlib.sha256((OUT/'blender-cycles.png').read_bytes()).hexdigest()
metadata['blendSha256']=hashlib.sha256((OUT/'nema17.blend').read_bytes()).hexdigest()
(OUT/'reference.json').write_text(json.dumps(metadata,indent=2)+'\n')
