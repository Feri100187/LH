"""Read current GLB/Laya geometry and audit conservative duck swimming envelopes."""
from pathlib import Path
import argparse, hashlib, json, math, struct, sys
from collections import Counter
from datetime import datetime, timezone
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
GLB = ROOT / 'assets/lingshui/LingshuiLake.glb'
LH = ROOT / 'assets/lingshui/LingshuiEnvironment.lh'
SPAWN = np.array([-26., 1.76, 37.2])
WATER_Y = .04

def matrix(position=None, rotation=None, scale=None, raw=None):
    if raw is not None: return np.array(raw, dtype=float).reshape(4, 4).T
    p = position or [0, 0, 0]; q = rotation or [0, 0, 0, 1]; s = scale or [1, 1, 1]
    x, y, z, w = q
    m = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w), 0],
                  [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w), 0],
                  [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y), 0], [0, 0, 0, 1]], dtype=float)
    m[:3, :3] *= s; m[:3, 3] = p
    return m

def load_geometry():
    raw = GLB.read_bytes(); jlen = struct.unpack_from('<I', raw, 12)[0]
    g = json.loads(raw[20:20+jlen]); binary = memoryview(raw)[28+jlen:]
    cache = {}
    def accessor(index):
        if index in cache: return cache[index]
        a = g['accessors'][index]; v = g['bufferViews'][a['bufferView']]
        typ = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        size = np.dtype(typ).itemsize; stride = v.get('byteStride', width * size)
        values = np.ndarray((a['count'], width), dtype=typ, buffer=binary,
            offset=v.get('byteOffset', 0)+a.get('byteOffset', 0), strides=(stride, size)).copy()
        cache[index] = values; return values
    parents = {c:i for i,n in enumerate(g['nodes']) for c in n.get('children', [])}
    matrices = {}
    def world(i):
        if i not in matrices:
            n = g['nodes'][i]; m = matrix(n.get('translation'), n.get('rotation'), n.get('scale'), n.get('matrix'))
            matrices[i] = world(parents[i]) @ m if i in parents else m
        return matrices[i]
    native = {}
    def scan(n, parent):
        t = n.get('transform', {})
        def xyz(key, default, four=False):
            value=t.get(key)
            return [value.get(k, default[i]) for i,k in enumerate('xyzw' if four else 'xyz')] if value else default
        m = parent @ matrix(xyz('localPosition', [0,0,0]), xyz('localRotation', [0,0,0,1], True), xyz('localScale', [1,1,1]))
        comps=n.get('_$comp', [])
        if any(c.get('_$type')=='MeshFilter' for c in comps): native[n.get('name')]=(m,n)
        for child in n.get('_$child', []): scan(child,m)
    scan(json.loads(LH.read_text(encoding='utf-8')), np.eye(4))
    mesh_cache={}
    def geometry(mi):
        if mi not in mesh_cache:
            out=[]
            for p in g['meshes'][mi]['primitives']:
                vertices=accessor(p['attributes']['POSITION']).astype(float)
                indices=accessor(p['indices']).ravel() if 'indices' in p else np.arange(len(vertices))
                out.append((vertices, indices.reshape(-1,3)))
            mesh_cache[mi]=out
        return mesh_cache[mi]
    objects=[]
    for i,n in enumerate(g['nodes']):
        name=n.get('name','')
        if 'mesh' not in n or name.startswith('COL__') or name not in native: continue
        nm, node=native[name]; gm=world(i)
        if np.max(np.abs(gm-nm)) > 1e-3: raise AssertionError(f'Native/GLB transform mismatch: {name}')
        materials=[c for c in node.get('_$comp',[]) if c.get('_$type') in ['MeshRenderer','SkinnedMeshRenderer']]
        if not materials or materials[0].get('enabled') is False: continue
        bounds=[]
        for p in g['meshes'][n['mesh']]['primitives']:
            a=g['accessors'][p['attributes']['POSITION']]
            lo=np.array(a['min']);hi=np.array(a['max'])
            corners=np.array([[x,y,z,1] for x in [lo[0],hi[0]] for y in [lo[1],hi[1]] for z in [lo[2],hi[2]]])
            bounds.append((gm @ corners.T).T[:,:3])
        bounds=np.concatenate(bounds);lo=bounds.min(axis=0);hi=bounds.max(axis=0)
        mesh_filter=next(c for c in node['_$comp'] if c.get('_$type')=='MeshFilter')
        objects.append({'name':name,'mesh':n['mesh'],'matrix':gm,'min':lo,'max':hi,'node':i,
                        'native_mesh_uuid':mesh_filter['sharedMesh']['_$uuid']})
    return raw,g,objects,geometry

def triangles_of(obj, geometry):
    out=[]
    for vertices,indices in geometry(obj['mesh']):
        homogeneous=np.column_stack((vertices,np.ones(len(vertices))))
        positions=(obj['matrix'] @ homogeneous.T).T[:,:3]
        out.append(positions[indices])
    return np.concatenate(out)

def inside(point, triangles):
    p=np.asarray(point); a=triangles[:,0];b=triangles[:,1];c=triangles[:,2]
    cross=lambda u,v:u[:,0]*v[:,1]-u[:,1]*v[:,0]
    x=cross(b-a,p-a);y=cross(c-b,p-b);z=cross(a-c,p-c)
    area=cross(b-a,c-a)
    return np.any(((x>=-1e-8)&(y>=-1e-8)&(z>=-1e-8)|(x<=1e-8)&(y<=1e-8)&(z<=1e-8)) & (np.abs(area)>1e-9))

def segment_distance(point, segments):
    p=np.asarray(point);a=segments[:,0];v=segments[:,1]-a
    denom=np.einsum('ij,ij->i',v,v);t=np.divide(np.einsum('ij,ij->i',p-a,v),denom,out=np.zeros(len(v)),where=denom>1e-15)
    nearest=a+v*np.clip(t,0,1)[:,None]
    return float(np.sqrt(np.min(np.sum((nearest-p)**2,axis=1))))

def boundaries(triangles):
    counts=Counter()
    for tri in triangles:
        points=[tuple(np.round(p,5)) for p in tri]
        for i in range(3): counts[tuple(sorted((points[i],points[(i+1)%3])))]+=1
    return np.array([edge for edge,count in counts.items() if count==1],dtype=float)

def native_mesh(filename):
    data=Path(filename).read_bytes();pos=0
    def read(fmt):
        nonlocal pos
        result=struct.unpack_from('<'+fmt,data,pos);pos+=struct.calcsize('<'+fmt)
        return result[0] if len(result)==1 else result
    def string():
        nonlocal pos
        size=read('H');result=data[pos:pos+size].decode('utf-8');pos+=size;return result
    version=string();assert version=='LAYAMODEL:0501'
    data_offset,data_size=read('II');count=read('H');blocks=[read('II') for _ in range(count)]
    string_offset,string_count=read('IH');pos=data_offset+string_offset;strings=[string() for _ in range(string_count)]
    for start,length in blocks:
        pos=start;kind=strings[read('H')]
        if kind!='MESH':continue
        name=strings[read('H')];buffers=read('h');assert buffers==1
        vertex_offset,vertex_count=read('II');flags=strings[read('H')].split(',')
        sizes={'POSITION':12,'NORMAL':12,'COLOR':16,'UV':8,'UV1':8,'TANGENT':16,'BLENDWEIGHT':16,'BLENDINDICES':4}
        stride=sum(sizes[flag] for flag in flags);offset=sum(sizes[flag] for flag in flags[:flags.index('POSITION')])
        vertices=np.ndarray((vertex_count,3),dtype='<f4',buffer=data,offset=data_offset+vertex_offset+offset,strides=(stride,4)).copy()
        index_offset,index_length=read('II');indices=np.frombuffer(data,dtype='<u4' if vertex_count>65535 else '<u2',
            count=index_length//(4 if vertex_count>65535 else 2),offset=data_offset+index_offset).copy().reshape(-1,3)
        return vertices,indices
    raise ValueError('No mesh block')

def ray_hit(origin,target,triangles):
    direction=np.asarray(target)-origin;a=triangles[:,0];e1=triangles[:,1]-a;e2=triangles[:,2]-a
    h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.einsum('ij,ij->i',e1,h)
    valid=np.abs(det)>1e-10;inv=np.divide(1,det,out=np.zeros(len(det)),where=valid);s=origin-a
    u=inv*np.einsum('ij,ij->i',s,h);q=np.cross(s,e1);v=inv*(q@direction);t=inv*np.einsum('ij,ij->i',e2,q)
    ok=valid&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)&(t>1e-5)&(t<1-1e-5)
    return float(t[ok].min()) if np.any(ok) else None

def main():
    raw,g,objects,geometry=load_geometry()
    scene_path=ROOT/'assets/LingshuiGame.ls';environment_world=[]
    def find_environment(node,parent):
        t=node.get('transform',{})
        values=lambda key,default:[t[key].get(k,default[i]) for i,k in enumerate('xyzw'[:len(default)])] if key in t else default
        local=matrix(values('localPosition',[0,0,0]),values('localRotation',[0,0,0,1]),values('localScale',[1,1,1]))
        world=parent@local
        if node.get('name')=='LingshuiEnvironment':environment_world.append(world)
        for child in node.get('_$child',[]):find_environment(child,world)
    find_environment(json.loads(scene_path.read_text(encoding='utf-8')),np.eye(4))
    assert len(environment_world)==1 and np.max(np.abs(environment_world[0]-np.eye(4)))<1e-8
    waters=[o for o in objects if '水面' in o['name']]
    water_triangles=np.concatenate([triangles_of(o,geometry) for o in waters])
    surface=water_triangles[:,:,[0,2]]; shore=boundaries(surface)
    assert np.max(np.abs(water_triangles[:,:,1]-WATER_Y))<1e-5
    # Conservative projections of every above-water object near the spawn-facing search area.
    obstacles=[];ray_obstacles=[]
    for obj in objects:
        if '水面' in obj['name'] or obj['max'][1]<WATER_Y:continue
        if obj['max'][0]<-45 or obj['min'][0]>5 or obj['max'][2]<8 or obj['min'][2]>38:continue
        tris=triangles_of(obj,geometry)
        tris=tris[np.max(tris[:,:,1],axis=1)>=WATER_Y]
        ray_obstacles.append((obj,tris))
        tri2=tris[:,:,[0,2]]
        # Ignore fully degenerate projected faces; other faces still bound the same solids.
        ab=tri2[:,1]-tri2[:,0];ac=tri2[:,2]-tri2[:,0]
        tri2=tri2[np.abs(ab[:,0]*ac[:,1]-ab[:,1]*ac[:,0])>1e-9]
        if not len(tri2):continue
        obstacles.append((obj,tri2,np.concatenate([tri2[:,[0,1]],tri2[:,[1,2]],tri2[:,[2,0]]])))
    def audit_point(point):
        water=bool(inside(point,surface));clearance=segment_distance(point,shore) if water else -segment_distance(point,shore)
        nearest=[]
        for obj,tri,edges in obstacles:
            low=obj['min'][[0,2]];high=obj['max'][[0,2]]
            box_distance=np.linalg.norm(np.maximum(np.maximum(low-point,np.array(point)-high),0))
            if box_distance>15:continue
            d=0. if inside(point,tri) else segment_distance(point,edges)
            nearest.append((d,obj['name']))
        nearest.sort()
        vector=np.asarray(point)-SPAWN[[0,2]];dist=float(np.linalg.norm(vector));angle=math.degrees(math.atan2(vector[0],-vector[1])-.32)
        return {'water':water,'water_boundary_clearance_m':clearance,'nearest_obstacles':nearest[:6],
                'spawn_distance_xz_m':dist,'spawn_heading_offset_degrees':angle}
    parser=argparse.ArgumentParser();parser.add_argument('--scan',action='store_true');args=parser.parse_args()
    if args.scan:
        candidates=[]
        for x in np.arange(-32,0.1,2):
            for z in np.arange(12,34.1,2):
                p=[float(x),float(z)];v=audit_point(p)
                if v['water'] and v['water_boundary_clearance_m']>1.3 and v['nearest_obstacles'][0][0]>1.3 and abs(v['spawn_heading_offset_degrees'])<40:
                    candidates.append({'center_xz':p,**v})
        candidates.sort(key=lambda x:x['spawn_distance_xz_m'])
        print(json.dumps({'water':[{ 'name':o['name'],'min':o['min'].tolist(),'max':o['max'].tolist()} for o in waters],
                          'water_boundary_edges':len(shore),'obstacle_objects_checked':len(obstacles),'candidates':candidates[:35]},ensure_ascii=False,indent=2))
        return
    # Paths are disjoint even when their independent animation phases line up unfavourably.
    routes=[
        {'id':'near_1','center_xz':[-24.8,30.0],'radii_xz':[.65,.50],'period_s':42,'phase_rad':0.,'direction':1},
        {'id':'near_2','center_xz':[-21.8,29.8],'radii_xz':[.55,.50],'period_s':47,'phase_rad':2.1,'direction':-1},
        {'id':'near_3','center_xz':[-23.4,27.0],'radii_xz':[.70,.55],'period_s':53,'phase_rad':4.2,'direction':1},
        {'id':'far_1','center_xz':[-20.0,22.0],'radii_xz':[.90,.65],'period_s':68,'phase_rad':1.3,'direction':-1},
        {'id':'far_2','center_xz':[-16.5,21.5],'radii_xz':[1.10,.70],'period_s':73,'phase_rad':4.9,'direction':1}
    ]
    native_paths={}
    for meta in (ROOT/'assets/lingshui/site_fixed').glob('*.lm.meta'):
        native_paths[json.loads(meta.read_text(encoding='utf-8'))['uuid']]=meta.with_suffix('')
    native_checks=[]
    for obj in objects:
        if obj['native_mesh_uuid'] not in native_paths:continue
        if not any(word in obj['name'] for word in ['水面','连续坡地','草洲','离岸曲线栈道','亭台与短桥','桥面']):continue
        filename=native_paths[obj['native_mesh_uuid']];vp,ip=native_mesh(filename)
        parts=geometry(obj['mesh']);gp=np.concatenate([v for v,i in parts]);gis=[];offset=0
        for v,i in parts:gis.append(i+offset);offset+=len(v)
        gi=np.concatenate(gis)
        canonical=lambda arr:np.array(sorted(map(tuple,np.sort(arr,axis=1))))
        maxdiff=float(np.max(np.abs(vp-gp)));same_triangles=bool(np.array_equal(canonical(ip),canonical(gi)))
        assert maxdiff<1e-5 and same_triangles,(obj['name'],maxdiff,same_triangles)
        native_checks.append({'name':obj['name'],'native_file':str(filename),'native_sha256':hashlib.sha256(filename.read_bytes()).hexdigest(),
            'vertices':len(vp),'triangles':len(ip),'max_position_difference':maxdiff,'same_triangle_topology_ignoring_winding':same_triangles})
    duck_radius=.30;eye=SPAWN+np.array([0,.72,0]);envelopes=[]
    for route in routes:
        center=np.array(route['center_xz']);radius=max(route['radii_xz']);point=audit_point(center)
        angles=np.linspace(0,2*math.pi,128,endpoint=False)
        samples=center+np.column_stack((route['radii_xz'][0]*np.cos(angles),route['radii_xz'][1]*np.sin(angles)))
        assert all(inside(p,surface) for p in samples)
        route['center_y_up']=[float(center[0]),WATER_Y,float(center[1])]
        route.update(point)
        route['route_plus_body_radius_m']=radius+duck_radius
        route['guaranteed_water_edge_clearance_m']=point['water_boundary_clearance_m']-radius-duck_radius
        route['guaranteed_obstacle_clearance_m']=point['nearest_obstacles'][0][0]-radius-duck_radius
        route['water_containment_samples_passed']=len(samples)
        assert route['guaranteed_water_edge_clearance_m']>0 and route['guaranteed_obstacle_clearance_m']>0
        seen=[]
        for p in [center,*samples[::16]]:
            target=np.array([p[0],WATER_Y+.20,p[1]]);hits=[]
            for obj,tris in ray_obstacles:
                t=ray_hit(eye,target,tris)
                if t is not None:hits.append((t,obj['name']))
            hits.sort();seen.append({'target':target.tolist(),'clear':not hits,'nearest_occluder':hits[0] if hits else None})
        route['spawn_eye_visibility_rays']=seen
        route['spawn_eye_visibility_clear_count']=sum(p['clear'] for p in seen)
        envelopes.append((route['id'],center,radius))
    pair_clearances=[]
    for i,(name,a,ra) in enumerate(envelopes):
        for other,b,rb in envelopes[i+1:]:
            separation=float(np.linalg.norm(a-b));bodygap=separation-ra-rb-2*duck_radius
            assert bodygap>=.8,(name,other,bodygap)
            pair_clearances.append({'a':name,'b':other,'center_distance_m':separation,'minimum_route_center_gap_m':separation-ra-rb,
                                    'guaranteed_duck_body_gap_m':bodygap})
    groups=[]
    for obj in objects:
        if any(word in obj['name'] for word in ['草洲','亭台与短桥','红桥_平直桥面','离岸曲线栈道_两侧留水.']):
            groups.append({'name':obj['name'],'min_y_up':obj['min'].tolist(),'max_y_up':obj['max'].tolist()})
    report={'status':'PASS','checked_utc':datetime.now(timezone.utc).isoformat(),'read_only_scene_audit':True,
        'coordinate_system':'Game Y up; route x/z coordinates already include GLB and prefab transforms',
        'files':{'glb':str(GLB),'glb_sha256':hashlib.sha256(raw).hexdigest(),'prefab':str(LH),'prefab_sha256':hashlib.sha256(LH.read_bytes()).hexdigest(),
                 'scene':str(scene_path)},'scene_environment_instance_world_matrix':environment_world[0].tolist(),
        'spawn_y_up':SPAWN.tolist(),'spawn_eye_y_up':eye.tolist(),'default_yaw_rad':.32,'water_y':WATER_Y,
        'water_vertex_y_range':[float(water_triangles[:,:,1].min()),float(water_triangles[:,:,1].max())],
        'water_triangles':len(surface),'water_boundary_edges':len(shore),'native_mesh_checks':native_checks,
        'checked_visible_object_transforms':len(objects),'nearby_above_water_obstacle_objects':len(obstacles),
        'obstacle_check_method':'Conservative XZ projection of actual above-water triangles; includes reeds, foliage, rocks, terrain and structures. No old rectangular shoreline assumptions.',
        'containment_proof':'Center is in actual water triangles; distance to every water boundary exceeds maximum ellipse radius plus 0.30m duck body envelope, covering the complete continuous route.',
        'body_envelope_radius_m':duck_radius,'minimum_all_phase_body_gap_m':min(p['guaranteed_duck_body_gap_m'] for p in pair_clearances),
        'routes':routes,'pair_clearances':pair_clearances,'landmark_bounds':groups,
        'placement_notes':['Route center Y=0.04 is the waterline anchor, not necessarily the asset pivot. Align the imported duck belly waterline using a local model offset.',
            'Recommended duck overall length about 0.50m; body envelope radius 0.30m is used for all-phase collision clearance.',
            'LakeWater.shader vertex stage has no displacement; its animated ripples affect shading only. Optional visual bob should stay around +/-0.008m.',
            'Ellipse parameterization x=cx+rx*cos(theta), z=cz+rz*sin(theta); use the tangent for heading. Independent periods/phases are safe for any relative phase.',
            'Visibility rays test environment geometry from the initial first-person eye to 0.20m above the water; they do not include player arms or future placed actors.']}
    output=Path(__file__).with_name('placement_audit.json');output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':report['status'],'water_y':WATER_Y,'native_meshes_verified':len(native_checks),
        'minimum_body_gap_m':report['minimum_all_phase_body_gap_m'],'routes':[{k:r[k] for k in ['id','center_y_up','radii_xz','spawn_distance_xz_m','spawn_heading_offset_degrees','guaranteed_water_edge_clearance_m','guaranteed_obstacle_clearance_m','spawn_eye_visibility_clear_count']} for r in routes],
        'output':str(output)},ensure_ascii=False,indent=2))

if __name__=='__main__':
    try:sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:pass
    main()
