import assert from 'node:assert/strict';

await import('./g-force-visualizer.js');
const visualizer = globalThis.RideTrackerGForceVisualizer;
assert.ok(visualizer);

assert.deepEqual(visualizer.normalizeSample({lateral:.3,longitudinal:-.4,normal:1.7}), {
  lateralG:.3, longitudinalG:-.4, normalG:1.7, horizontalG:.5,
});

const horizontal = visualizer.horizontalPoint({lateralG:2,longitudinalG:1},{cx:100,cy:100,radius:50},2);
assert.deepEqual(horizontal,{x:150,y:75});
const vertical = visualizer.verticalPoint({normalG:1},{x:20,top:10,height:100},{min:-1,max:4});
assert.deepEqual(vertical,{x:20,y:70});

const trail = visualizer.createTrail({maxAgeMs:1000,maxPoints:4,minimumIntervalMs:0});
for(let index=0;index<6;index+=1)trail.push({lateralG:index/10,normalG:1+index/10},index*100);
assert.equal(trail.size(),4);
assert.equal(trail.snapshot(500).at(-1).normalG,1.5);
trail.push({lateralG:-1,normalG:0},50);
assert.equal(trail.size(),1,'A backwards replay seek resets the trail');

const defaultTrail = visualizer.createTrail();
assert.equal(defaultTrail.maxAgeMs,3000,'The visible G-force history is exactly three seconds');
const freshAppearance=visualizer.trailAppearance(0),middleAppearance=visualizer.trailAppearance(.5),expiredAppearance=visualizer.trailAppearance(1);
assert.ok(freshAppearance.alpha>middleAppearance.alpha&&middleAppearance.alpha>expiredAppearance.alpha,'Trail alpha fades continuously with age');
assert.equal(expiredAppearance.alpha,0,'A three-second-old trail point is fully transparent');
assert.ok(freshAppearance.widthFactor>middleAppearance.widthFactor,'The soft tail tapers as it gets older');
assert.equal(visualizer.forceColor({normalG:0},'vertical'),'#a78bfa');
assert.equal(visualizer.forceColor({lateralG:1,longitudinalG:1},'horizontal'),'#ff5d78');

console.log('G-force visualizer tests passed.');
