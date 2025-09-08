const test = require('node:test');
const assert = require('node:assert');
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');

global.indexedDB = new FDBFactory();

let ScraperDB = require('../public/idb.js');

async function setupInitialRun(){
  await ScraperDB.init();
  await ScraperDB.saveSettings({ concurrency: 2, delay: 0 });
  await ScraperDB.enqueueUrls(['http://a.com','http://b.com']);
}

test('session resumes after crash', async () => {
  await setupInitialRun();
  let item = await ScraperDB.getNext();
  await ScraperDB.markComplete(item.id, { index:item.index, url:item.url, text:'A', metadata:{}, success:true });

  // Simulate crash by reloading module
  ScraperDB.close();
  delete require.cache[require.resolve('../public/idb.js')];
  ScraperDB = require('../public/idb.js');
  await ScraperDB.init();
  const state = await ScraperDB.loadState();
  assert.equal(state.results.length, 1);
  assert.equal(state.queue.filter(q=>q.status==='complete').length, 1);
  assert.equal(state.settings.concurrency, 2);

  // resume processing
  item = await ScraperDB.getNext();
  await ScraperDB.markComplete(item.id, { index:item.index, url:item.url, text:'B', metadata:{}, success:true });

  const final = await ScraperDB.loadState();
  assert.equal(final.results.length, 2);
  assert.ok(!(await ScraperDB.hasUnfinished()));
});
