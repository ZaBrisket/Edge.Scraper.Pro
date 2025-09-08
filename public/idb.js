(function(global){
  const DB_NAME = 'scraperState';
  const DB_VERSION = 1;
  let db;

  function openDB(){
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if(!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        if(!db.objectStoreNames.contains('results')) db.createObjectStore('results', { keyPath: 'id' });
        if(!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
        if(!db.objectStoreNames.contains('logs')) db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
      };
      request.onsuccess = (event) => { db = event.target.result; resolve(); };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  function logTransition(id, from, to){
    const tx = db.transaction('logs','readwrite');
    tx.objectStore('logs').add({ ts: Date.now(), id, from, to });
  }

  async function enqueueUrls(urls){
    const tx = db.transaction(['queue','logs'],'readwrite');
    const queue = tx.objectStore('queue');
    const logs = tx.objectStore('logs');
    urls.forEach((url, index) => {
      const req = queue.add({ index, url, status: 'queued', retries: 0 });
      req.onsuccess = (e) => logs.add({ ts: Date.now(), itemId: e.target.result, from: null, to: 'queued' });
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function getNext(){
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['queue','logs'],'readwrite');
      tx.onerror = (e) => reject(e.target.error);
      const store = tx.objectStore('queue');
      const logs = tx.objectStore('logs');
      const req = store.openCursor();
      req.onerror = (e) => reject(e.target.error);
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if(!cursor){ resolve(null); return; }
        const value = cursor.value;
        if(value.status === 'queued'){
          const id = value.id;
          value.status = 'processing';
          const updateReq = cursor.update(value);
          logs.add({ ts: Date.now(), itemId: id, from: 'queued', to: 'processing' });
          updateReq.onsuccess = () => resolve(value);
        } else {
          cursor.continue();
        }
      };
    });
  }

  async function markComplete(id, result){
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['queue','results','logs'],'readwrite');
      const queue = tx.objectStore('queue');
      const results = tx.objectStore('results');
      const logs = tx.objectStore('logs');
      queue.get(id).onsuccess = (e) => {
        const record = e.target.result;
        const from = record.status;
        record.status = 'complete';
        queue.put(record);
        results.put({ id, ...result });
        logs.add({ ts: Date.now(), itemId: id, from, to: 'complete' });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function markFailed(id, error, retryLimit=3){
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['queue','results','logs'],'readwrite');
      const queue = tx.objectStore('queue');
      const results = tx.objectStore('results');
      const logs = tx.objectStore('logs');
      queue.get(id).onsuccess = (e) => {
        const record = e.target.result;
        const from = record.status;
        record.retries = (record.retries || 0) + 1;
        let to = 'failed';
        if(record.retries < retryLimit){
          record.status = 'queued';
          to = 'queued';
        }else{
          record.status = 'failed';
          results.put({ id, ...error });
        }
        queue.put(record);
        logs.add({ ts: Date.now(), itemId: id, from, to });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveSettings(settings){
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings','readwrite');
      tx.objectStore('settings').put({ id: 'current', ...settings });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function loadState(){
    const results = await new Promise((resolve, reject) => {
      const tx = db.transaction('results');
      const req = tx.objectStore('results').getAll();
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    const settings = await new Promise((resolve, reject) => {
      const tx = db.transaction('settings');
      const req = tx.objectStore('settings').get('current');
      req.onsuccess = (e) => resolve(e.target.result || {});
      req.onerror = (e) => reject(e.target.error);
    });
    const queue = await new Promise((resolve, reject) => {
      const tx = db.transaction('queue');
      const req = tx.objectStore('queue').getAll();
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return { results, settings, queue };
  }

  async function hasUnfinished(){
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue');
      const req = tx.objectStore('queue').openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if(!cursor){ resolve(false); return; }
        const status = cursor.value.status;
        if(status !== 'complete'){ resolve(true); return; }
        cursor.continue();
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function countQueue(){
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue');
      const req = tx.objectStore('queue').count();
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function clearAll(){
    if(db) db.close();
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => { db = undefined; openDB().then(resolve); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  const ScraperDB = { init: openDB, enqueueUrls, getNext, markComplete, markFailed, saveSettings, loadState, hasUnfinished, countQueue, clearAll };
  ScraperDB.close = () => { if(db) db.close(); };
  if(typeof module !== 'undefined') module.exports = ScraperDB;
  global.ScraperDB = ScraperDB;
})(typeof self !== 'undefined' ? self : global);
