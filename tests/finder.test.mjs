import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupFibers,colorCodes,standard12ColorCodes} from '../src/app/finder/fiber-codes.ts';

test('all original color code sequences are included',()=>{
 assert.equal(Object.keys(colorCodes).length,22);
 assert.equal(colorCodes['OPGW / TIA-598'][0].name,'Blue');
 assert.equal(colorCodes['Telenor'][0].name,'White');
});
test('tubes restart colors at position one',()=>{
 const r=lookupFibers('OPGW / TIA-598',12,'12,13');
 assert.equal(r.error,'');assert.equal(r.rows.length,2);
 assert.equal(r.rows[0].tube,1);assert.equal(r.rows[0].displayColor.name,'Turquoise');
 assert.equal(r.rows[1].tube,2);assert.equal(r.rows[1].position,1);assert.equal(r.rows[1].displayColor.name,'Blue');
});
test('above 12 colors, repeated positions have three stripe marking',()=>{
 const r=lookupFibers('Telenor',24,'13,20');
 assert.equal(r.error,'');assert.ok(r.rows[0].striped);assert.equal(r.rows[0].displayName,'WHITE ///');
 assert.equal(r.rows[1].displayName,'BLANK ///');assert.equal(r.rows[1].displayColor.name,'White');
});
test('special codes require their fixed tube size',()=>{
 assert.equal(standard12ColorCodes.has('BBS 6F'),false);
 assert.ok(lookupFibers('BBS 6F',12,'6').error);
 assert.equal(lookupFibers('BBS 6F',6,'7').rows[0].tube,2);
});
test('invalid input never creates results',()=>{
 for(const s of ['', '0', '-1', '13,', 'abc', '1.5','9007199254740992']){
  const r=lookupFibers('Telenor',12,s);assert.ok(r.error,'should reject '+s);assert.equal(r.rows.length,0);
 }
});
