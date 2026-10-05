"""Measure flat-surface grain against the shared Blender reference.
Usage: python scripts/measure-board-grain.py baseline-dir initial-dir refined-dir
Requires numpy and Pillow. This supplements image error and visual review;
it is not a general perceptual quality score.
"""
import numpy as np,json,pathlib,sys
from PIL import Image
if len(sys.argv) != 4: raise ValueError('Expected baseline, initial and refined directories')
base,initial,revised=map(pathlib.Path,sys.argv[1:])
metadata=json.loads((base/'results.json').read_text())
for directory in (initial,revised):
 current=json.loads((directory/'results.json').read_text())
 for key in ('glbSha256','environmentSha256','width','height','supersampling'):
  if current[key] != metadata[key]: raise ValueError('Source/settings mismatch: '+key)
 for old,new in zip(metadata['views'],current['views'],strict=True):
  for key in ('name','options','viewMatrix','projectionMatrix'):
   if old[key] != new[key]: raise ValueError('Camera mismatch: '+key)
def image(p):return np.array(Image.open(p).convert('RGBA'),dtype=float)/255
def mean3(a):
 p=np.pad(a,((1,1),(1,1),(0,0)),mode='edge');h,w=a.shape[:2]
 return sum(p[y:y+h,x:x+w] for y in range(3) for x in range(3))/9
result={'method':'High-frequency RGB error RMS against the same Blender reference, on flat reference foreground pixels only. Flat mask: 3x3 per-channel range below 0.02; eroded by a 5x5 window to exclude edges. High-pass: RGB minus 3x3 box mean. Measures grain, not full-image similarity.', 'views':[]}
for name in ['front','back','detail']:
 r=image(base/(name+'-blender.png'));rgb=r[:,:,:3];h,w=rgb.shape[:2]
 p=np.pad(rgb,((1,1),(1,1),(0,0)),mode='edge');neighbors=np.stack([p[y:y+h,x:x+w] for y in range(3) for x in range(3)])
 flat=(np.max(np.ptp(neighbors,axis=0),axis=2)<.02)&(r[:,:,3]==1)
 p=np.pad(flat,((2,2),(2,2)),constant_values=False)
 flat=np.logical_and.reduce([p[y:y+h,x:x+w] for y in range(5) for x in range(5)])
 row={'name':name,'flatReferencePixels':int(flat.sum())}
 for label,d in [('original',base),('initialOptimization',initial),('refined',revised)]:
  a=image(d/(name+'.png'))[:,:,:3];e=(a-mean3(a))-(rgb-mean3(rgb))
  row[label+'HighFrequencyRmse']=float(np.sqrt(np.mean(e[flat]**2)))
 row['reductionVsInitialPercent']=100*(1-row['refinedHighFrequencyRmse']/row['initialOptimizationHighFrequencyRmse'])
 row['reductionVsOriginalPercent']=100*(1-row['refinedHighFrequencyRmse']/row['originalHighFrequencyRmse'])
 result['views'].append(row)
print(json.dumps(result,indent=2));(revised/'grain.json').write_text(json.dumps(result,indent=2)+'\n')
