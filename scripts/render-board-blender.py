"""Render an embedded board GLB against PoppyGL's shared studio at 500 Cycles samples.
Usage: blender -b -t 5 --python scripts/render-board-blender.py -- board.glb baseline-dir
"""
import bpy, json, math, pathlib, hashlib, sys, time
from mathutils import Vector, Matrix
ROOT = pathlib.Path(__file__).resolve().parents[1]
args = sys.argv[sys.argv.index('--')+1:]
glb, out = pathlib.Path(args[0]).resolve(), pathlib.Path(args[1]).resolve()
meta = json.loads((out/'results.json').read_text())
if hashlib.sha256(glb.read_bytes()).hexdigest() != meta['glbSha256']:
    raise ValueError('Reference must use the exact same GLB')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(glb))
# Remove imported cameras and lamps; materials and evaluated geometry stay intact.
for obj in list(bpy.context.scene.objects):
    if obj.type in ('CAMERA', 'LIGHT'):
        bpy.data.objects.remove(obj, do_unlink=True)
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
scene.render.engine='CYCLES'
scene.cycles.samples=500
scene.cycles.use_adaptive_sampling=False
scene.cycles.seed=0
scene.cycles.use_denoising=False  # Portable reference: some Blender builds omit OIDN.
scene.cycles.max_bounces=8
scene.render.resolution_x=meta['width']*meta['supersampling']
scene.render.resolution_y=meta['height']*meta['supersampling']
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.render.image_settings.color_depth='8'
scene.view_settings.view_transform='Standard'
scene.view_settings.look='None'
scene.view_settings.exposure=0
scene.view_settings.gamma=1
# glTF Y-up to Blender Z-up; camera local axes already match Blender (-Z forward).
convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
bpy.ops.object.camera_add()
camera=bpy.context.object
scene.camera=camera
camera.data.type='PERSP'
camera.data.sensor_fit='VERTICAL'
camera.data.sensor_height=36
camera.data.clip_start=0.00001
camera.data.clip_end=1000000
records=[]
for view in meta['views']:
    flat=view['viewMatrix']
    matrix=Matrix([[flat[c*4+r] for c in range(4)] for r in range(4)])
    camera.matrix_world=convert @ matrix.inverted()
    n=scene.render.resolution_y
    # PoppyGL maps NDC onto N-1 samples; account for its half-pixel viewport offset.
    camera.data.lens=36/(2*math.tan(math.radians(view['options']['fov'])/2))*n/(n-1)
    camera.data.shift_x=0.5/scene.render.resolution_x
    camera.data.shift_y=-0.5/scene.render.resolution_y
    path=out/(view['name']+'-blender-2x.png')
    scene.render.filepath=str(path)
    start=time.perf_counter()
    bpy.ops.render.render(write_still=True)
    records.append({'name':view['name'],'seconds':time.perf_counter()-start,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
report={'blenderVersion':bpy.app.version_string,'engine':'CYCLES','samples':500,'adaptiveSampling':False,'denoising':False,'seed':0,'maxBounces':8,'viewTransform':'Standard','glbSha256':meta['glbSha256'],'environmentSha256':meta['environmentSha256'],'views':records}
(out/'blender-results.json').write_text(json.dumps(report,indent=2))
