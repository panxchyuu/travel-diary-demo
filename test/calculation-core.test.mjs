// All records in this file are fictional fixtures for automated checks.
import test from 'node:test';
import assert from 'node:assert/strict';
const calculation=await import('../calculation-core.mjs').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND')return {};
  throw error;
});

test('live expense calculations support splitting, subtraction and percentages',()=>{
  assert.equal(typeof calculation.calculate,'function');
  assert.equal(calculation.calculate({expression:'288 / 3',precision:2}).formatted,'96.00');
  assert.equal(calculation.calculate({expression:'(1380 - 500) / 3',precision:2}).formatted,'293.33');
  assert.equal(calculation.calculate({expression:'288 / 1380 * 100',precision:2}).formatted,'20.87');
});

test('decimal arithmetic and rounding are exact rather than binary floating point',()=>{
  assert.equal(typeof calculation.calculate,'function');
  assert.equal(calculation.calculate({expression:'0.1 + 0.2',precision:2}).formatted,'0.30');
  assert.equal(calculation.calculate({expression:'1.005',precision:2}).formatted,'1.01');
  assert.equal(calculation.calculate({expression:'-1.005',precision:2}).formatted,'-1.01');
  assert.equal(calculation.calculate({expression:'1 / 6',precision:2}).formatted,'0.17');
  assert.equal(calculation.calculate({expression:'2 * -(3 + 4)',precision:0}).result,-14);
});

test('calculator rejects unsafe syntax, incomplete expressions and zero division',()=>{
  assert.equal(typeof calculation.calculate,'function');
  for(const expression of ['1 / 0','1 +','(1+2','1 2','process.exit()','2 ** 8','1e999','1;2','Infinity','9'.repeat(300)]){
    assert.throws(()=>calculation.calculate({expression,precision:2}));
  }
  assert.throws(()=>calculation.calculate({expression:'1',precision:10}));
  assert.throws(()=>calculation.calculate({expression:'('.repeat(40)+'1'+')'.repeat(40),precision:2}));
});
