import assert from 'node:assert/strict';
import './track-3d.js';

const track3d=globalThis.RideTrackerTrack3D;

function syntheticRide(offset=0,speedOffset=0){
  const samples=[];
  for(let index=0;index<48;index+=1){
    const angle=index/47*Math.PI*2;
    samples.push({
      timestamp:index*100,
      latitude:48.268+Math.sin(angle)*0.0007+offset,
      longitude:7.721+Math.cos(angle)*0.0009+offset,
      relativeAltitudeM:Math.sin(angle*2)*12,
      speedKmh:35+Math.sin(angle)*20+speedOffset,
      normalG:1+Math.sin(angle*3)*1.2,
      lateralG:Math.cos(angle*2)*0.8,
      longitudinalG:Math.sin(angle)*0.5,
      totalG:1.2+Math.abs(Math.sin(angle*3))
    });
  }
  return {id:`ride-${offset}`,document:{samples},distanceMeters:620,durationSeconds:4.7};
}

{
  const model=track3d.deriveTrackModel(syntheticRide(),{targetPoints:96});
  assert.ok(model);
  assert.equal(model.points.length,96);
  assert.ok(model.distanceM>400);
  assert.ok(model.summary.maxSpeedKmh>50);
  assert.equal(Object.keys(model.ranges).length,Object.keys(track3d.METRICS).length);
  assert.ok(model.bounds.maxY-model.bounds.minY>10);
  assert.equal(model.version,2);
  assert.equal(model.points[0].distanceM,0);
  assert.ok(model.points.at(-1).distanceM>400);
  assert.equal(model.points.at(-1).progress,1);
}

{
  const picked=track3d.nearestProjectedPoint([{x:10,y:10},{x:50,y:50}],47,52,10);
  assert.equal(picked.index,1);
  assert.equal(track3d.nearestProjectedPoint([{x:10,y:10}],100,100,10),null);
}

{
  const first=track3d.deriveTrackModel(syntheticRide(0,0),{targetPoints:64});
  const second=track3d.deriveTrackModel(syntheticRide(0.000001,10),{targetPoints:64});
  const merged=track3d.mergeModels([first,second],{targetPoints:64});
  assert.equal(merged.sourceCount,2);
  assert.equal(merged.points.length,64);
  assert.ok(merged.points.every(point=>point.confidence===0.4));
  assert.ok(merged.summary.maxSpeedKmh>55);
}

{
  const model=track3d.deriveTrackModel(syntheticRide(),{targetPoints:40});
  const svg=track3d.thumbnailSvg(model,{title:'Voltron & Co.',metric:'totalG'});
  assert.match(svg,/^<svg/);
  assert.match(svg,/Voltron &amp; Co\./);
  assert.doesNotMatch(svg,/<script/i);
  assert.match(track3d.thumbnailDataUri(model,{title:'Test'}),/^data:image\/svg\+xml/);
  assert.match(track3d.metricColor('speedKmh',50,{min:0,max:100}),/^rgb\(/);
}

console.log('track-3d tests passed');
