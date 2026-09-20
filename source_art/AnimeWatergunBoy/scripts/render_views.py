import bpy,os,sys
out='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['Front','FaceDetail','ThreeQuarter']
scene=bpy.data.scenes['AWB_Presentation'];bpy.context.window.scene=scene
prefs=bpy.context.preferences.addons['cycles'].preferences
available=[x[0] for x in prefs.get_device_types(bpy.context)]
if 'OPTIX' in available:
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type=='OPTIX'
    scene.cycles.device='GPU'
scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1200;scene.render.resolution_percentage=85
for view in args:
    scene.camera=bpy.data.objects['AWB.Camera.'+view]
    scene.render.filepath=os.path.join(out,'qa','v1_'+view+'.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED',scene.render.filepath,flush=True)
