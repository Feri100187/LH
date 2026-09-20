CURRENT=studio;clear_col(studio)
scene.world=bpy.data.worlds.new('AWB soft neutral world')
scene.world.use_nodes=True
bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.73,.80,.90,1);bg.inputs['Strength'].default_value=.45
mesh('Preview ground',[(-200,-200,0),(200,-200,0),(200,200,0),(-200,200,0)],[(0,1,2,3)],'Backdrop',studio)
def area(name,loc,energy,size,color,target=(0,0,1)):
    d=bpy.data.lights.new('AWB.'+name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new('AWB.'+name,d);studio.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o
area('Key softbox',(-3.3,-4.0,5.0),430,4.0,(1,.91,.84))
area('Front fill',(2.7,-3.5,2.9),260,3.5,(.82,.90,1))
area('Hair and shoulder rim',(1.6,2.8,4.0),480,3.0,(.94,.97,1))
area('Back fill',(-2,3,2.3),200,3.0,(1,.92,.86))
def camera(name,loc,target,scale):
    d=bpy.data.cameras.new('AWB.Camera.'+name);d.type='ORTHO';d.ortho_scale=scale;d.lens=65
    o=bpy.data.objects.new('AWB.Camera.'+name,d);studio.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
cameras={}
cameras['Front']=camera('Front',(.02,-6,1.035),(.02,0,.947),2.06)
cameras['Side']=camera('Side',(6,0,1.035),(0,0,.947),2.06)
cameras['Back']=camera('Back',(.01,6,1.035),(.01,0,.947),2.06)
cameras['ThreeQuarter']=camera('ThreeQuarter',(3.5,-6,2.22),(.018,-.005,.946),2.12)
cameras['FaceDetail']=camera('FaceDetail',(.12,-3,1.80),(0,-.018,1.693),.365)
cameras['HandsDetail']=camera('HandsDetail',(.70,-3,1.70),(.09,-.31,1.251),.80)
scene.camera=cameras['ThreeQuarter']
try:scene.render.engine='CYCLES'
except TypeError:pass
scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.exposure=.25
for a in bpy.context.screen.areas:
    if a.type=='VIEW_3D':
        a.spaces.active.region_3d.view_distance=2.85;a.spaces.active.region_3d.view_location=(.01,0,.94)
        a.spaces.active.region_3d.view_rotation=cameras['ThreeQuarter'].rotation_euler.to_quaternion()
        a.spaces.active.overlay.show_overlays=False
        a.spaces.active.shading.color_type='MATERIAL'
        a.spaces.active.clip_end=1000
print('Preview studio ready')
