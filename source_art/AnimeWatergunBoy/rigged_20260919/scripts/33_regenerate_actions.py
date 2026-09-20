import bpy,math,json,os
from mathutils import Vector,Matrix,Quaternion,Euler
from math import sin,cos,pi,exp,sqrt
import numpy as np
OUT='D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919'
scene=bpy.data.scenes['AWB_Animated'];bpy.context.window.scene=scene;rig=bpy.data.objects['AWB_Rig'];arm=rig.data
rest={b.name:b.matrix_local.copy() for b in arm.bones};PB=rig.pose.bones
rig.animation_data.action=None
for tr in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(tr)
for name in ['Idle','Walk','Run','Jump','Shoot','RunJump']:
 if name in bpy.data.actions:bpy.data.actions.remove(bpy.data.actions[name],do_unlink=True)
src=open(OUT+'/scripts/20_make_actions.py',encoding='utf-8').read()
exec(compile('def smooth(t)'+src.split('def smooth(t)',1)[1],'rebuilt_actions','exec'),globals())
