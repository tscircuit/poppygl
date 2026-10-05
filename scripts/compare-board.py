"""Compare baseline and candidate against the same 500-sample Blender reference.
Usage: python scripts/compare-board.py baseline-dir [candidate-dir]
Requires numpy and Pillow. Results include foreground-only and whole-image errors.
"""
import sys, json, pathlib, math
import numpy as np
from PIL import Image, ImageDraw

base = pathlib.Path(sys.argv[1])
candidate = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else None
metadata = json.loads((base/'results.json').read_text())
blender = json.loads((base/'blender-results.json').read_text())
if blender['samples'] != 500 or blender['adaptiveSampling']:
    raise ValueError('Expected a full 500-sample Blender reference')
for key in ('glbSha256', 'environmentSha256'):
    if blender[key] != metadata[key]: raise ValueError('Blender source mismatch: '+key)
current = json.loads((candidate/'results.json').read_text()) if candidate else None
if current:
    for key in ('glbSha256', 'environmentSha256', 'runtime', 'cpu', 'logicalCpus', 'width', 'height', 'supersampling', 'runs', 'warmup', 'timingScope'):
        if current[key] != metadata[key]: raise ValueError('Candidate setting differs: '+key)

def pixels(path): return np.array(Image.open(path).convert('RGBA'), dtype=np.float64)/255
def composite(a): return a[:,:,:3]*a[:,:,3:4] + (1-a[:,:,3:4])*np.array([0.9,0.9,0.9])
def errors(a,b,mask):
    diff=composite(a)-composite(b)
    if not np.any(mask): raise ValueError('Empty foreground')
    d=diff[mask]
    mse=float(np.mean(d*d))
    return {'mae':float(np.mean(np.abs(d))), 'rmse':math.sqrt(mse), 'psnrDb':-10*math.log10(mse) if mse else None}

report={'status':'baseline-only' if not candidate else 'candidate-compared', 'qualityPolicy':'Each view: at least 2x median speedup; Blender MAE and RMSE increase at most 5%, for both whole image and foreground. Visual review also required.', 'views':[]}
all_pass=True
for i,view in enumerate(metadata['views']):
    name=view['name']
    b=pixels(base/(name+'.png'))
    ref=pixels(base/(name+'-blender-2x.png'))
    h,w=b.shape[:2]; s=metadata['supersampling']
    if ref.shape != (h*s,w*s,4): raise ValueError('Reference resolution mismatch')
    # Match PoppyGL box downsampling in encoded sRGB, including integer rounding.
    ref=np.floor(ref.reshape(h,s,w,s,4).mean(axis=(1,3))*255+0.5)/255
    Image.fromarray((ref*255).astype('uint8')).save(base/(name+'-blender.png'))
    mask=(b[:,:,3]>0) | (ref[:,:,3]>0)
    result={'name':name,'baselineMedianMs':view['medianMs'],'baselineBlenderWhole':errors(b,ref,np.ones((h,w),bool)),'baselineBlenderForeground':errors(b,ref,mask)}
    tiles=[ref,b]; labels=['Blender Cycles 500 samples','Current realistic baseline']
    if current:
        new=current['views'][i]
        if new['name'] != name or new['options'] != view['options'] or new['viewMatrix'] != view['viewMatrix'] or new['projectionMatrix'] != view['projectionMatrix']: raise ValueError('Candidate camera mismatch')
        a=pixels(candidate/(name+'.png'))
        if a.shape != b.shape: raise ValueError('Candidate resolution mismatch')
        common_mask=mask | (a[:,:,3]>0)
        result['baselineBlenderForeground']=errors(b,ref,common_mask)
        result.update({'candidateMedianMs':new['medianMs'],'speedup':view['medianMs']/new['medianMs'],'candidateBlenderWhole':errors(a,ref,np.ones((h,w),bool)),'candidateBlenderForeground':errors(a,ref,common_mask),'baselineCandidate':errors(a,b,common_mask),'changedRgbaPixels':int(np.count_nonzero(np.any(a!=b,axis=2)))})
        result['performancePass']=result['speedup']>=2
        result['qualityPass']=all(result['candidateBlender'+scope][metric] <= result['baselineBlender'+scope][metric]*1.05+1e-12 for scope in ('Whole','Foreground') for metric in ('mae','rmse'))
        all_pass &= result['performancePass'] and result['qualityPass']
        tiles += [a]; labels += ['Candidate realistic']
    canvas=Image.new('RGB',(w*len(tiles),h+30),'white'); draw=ImageDraw.Draw(canvas)
    for j,(tile,label) in enumerate(zip(tiles,labels)):
        canvas.paste(Image.fromarray(np.uint8(np.clip(composite(tile)*255,0,255))),(j*w,30))
        draw.text((j*w+8,8),label,fill='black')
    canvas.save((candidate or base)/(name+'-comparison.png'))
    report['views'].append(result)
report['numericPass']=bool(all_pass) if candidate else None
(candidate or base).joinpath('comparison.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
if candidate and not all_pass: sys.exit(1)
