import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../planner/sosi-reader.js',import.meta.url),'utf8');
const exportsForTest={exports:{}};
runInNewContext(source,{module:exportsForTest});
const {parse}=exportsForTest.exports;

function sample(code=22,refs=':1 :2 :3 :4'){
  return [
    '.HODE','..TEGNSETT UTF-8','..TRANSPAR',
    '...KOORDSYS '+code,'...ORIGO-NØ 0 0','...ENHET 0.01',
    '.PUNKT 8:','..OBJTYPE Fordeler','..NØ','665000000 50000000',
    '.KURVE 1:','..OBJTYPE Grense','..NØ','665000000 50000000','665000000 50010000',
    '.KURVE 2:','..NØ','665000000 50010000','665001000 50010000',
    '.KURVE 3:','..NØ','665001000 50010000','665001000 50000000',
    '.KURVE 4:','..NØ','665001000 50000000','665000000 50000000',
    '.FLATE 99:','..OBJTYPE Bygg','..REF '+refs,'.SLUTT'
  ].join('\n');
}

test('UTM 32, 33 and 35 read SOSI codes and convert to geographic degrees',()=>{
  for(const [code,expectedLon,epsg] of [[22,9,25832],[23,15,25833],[25,27,25835]]){
    const result=parse(sample(code));
    assert.equal(result.meta.epsg,epsg);
    const [lon,lat]=result.features[0].geometry.coordinates;
    assert.ok(Math.abs(lon-expectedLon)<0.00001);
    assert.ok(Math.abs(lat-59.98733)<0.0001);
  }
});

test('PUNKT, KURVE and FLATE with referenced curves convert into valid geometry',()=>{
  const result=parse(sample());
  assert.deepEqual(JSON.parse(JSON.stringify(result.meta.counts)),
    {points:1,lines:4,polygons:1});
  assert.equal(result.meta.skipped,0);
  const outer=result.features.find(x=>x.geometry.type==='Polygon').geometry.coordinates[0];
  assert.equal(outer.length,5);
  assert.deepEqual(outer[0],outer.at(-1));
});

test('Negative SOSI curve references reverse the ring safely',()=>{
  const result=parse(sample(22,':-4 :-3 :-2 :-1'));
  assert.equal(result.meta.counts.polygons,1);
});

test('Unsupported CRS or missing ORIGO-NØ is rejected without guessing',()=>{
  assert.throws(()=>parse(sample(99)),/Koordinatsystem 99 støttes ikke/);
  assert.throws(()=>parse(sample().replace('...ORIGO-NØ 0 0','')),
    /mangler gyldig \.\.\.ORIGO-NØ/);
});

test('Malformed FLATE is skipped while other geometries remain',()=>{
  const result=parse(sample(22,':1 :3'));
  assert.equal(result.meta.counts.polygons,0);
  assert.equal(result.meta.counts.lines,4);
  assert.equal(result.meta.skipped,1);
});

test('A file with no supported geometry cannot be imported',()=>{
  const empty=[
    '.HODE','..TRANSPAR','...KOORDSYS 22',
    '...ORIGO-NØ 0 0','...ENHET 1','.SLUTT'
  ].join('\n');
  assert.throws(()=>parse(empty),/Fant ingen støttede/);
  assert.throws(()=>parse('.KURVE 1:\n..NØ\n1 2'),/SOSI-filhode/);
});
