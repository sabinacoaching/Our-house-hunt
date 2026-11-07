import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nextColumnWidth} from '../comparison.js';

test('dragging a column boundary changes width and keeps it within useful bounds',()=>{
 assert.equal(nextColumnWidth(200,100,175),275);
 assert.equal(nextColumnWidth(200,100,-500),100);
 assert.equal(nextColumnWidth(200,100,1500),1000);
});
test('empty results leave room to open and resize the filter; its actions stay visible',()=>{
 const css=readFileSync(new URL('../comparison.css',import.meta.url),'utf8');
 assert.match(css,/hh-table-shell:has\(\.hh-status-filter-menu:not\(\[hidden\]\)\)\{min-height:/);
 assert.match(css,/resize:vertical/);
 assert.match(css,/hh-status-filter-actions\{position:sticky;bottom:/);
});
test('clearing the combined filters resets station and status without changing saved data',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/resetComparisonFilters/);
 assert.match(html,/onclick=\(\)=>\{viewingSelections=null;stationSelection=null;\$\('stageFilter'\)\.value='all';render\(\)\}/);
});
