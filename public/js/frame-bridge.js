(function(global){
  function FrameBridge(targetFrame){
    if(!(this instanceof FrameBridge)) return new FrameBridge(targetFrame);
    this.frame = targetFrame;
    this.handlers = new Map();
    this.origin = global.location ? global.location.origin : '*';
  }

  FrameBridge.prototype.send = function(type, payload){
    if(!this.frame || !this.frame.contentWindow || !type) return;
    var data = Object.assign({ type: type }, payload || {});
    try {
      this.frame.contentWindow.postMessage(data, this.origin);
    } catch (err) {
      console.error('FrameBridge send failed', err);
    }
  };

  FrameBridge.prototype.on = function(type, handler){
    if(!type || typeof handler !== 'function') return this;
    this.handlers.set(type, handler);
    return this;
  };

  FrameBridge.prototype.listen = function(){
    var self = this;
    if(this._listening) return;
    this._listening = true;
    global.addEventListener('message', function(event){
      if(!event || !event.data) return;
      if(event.origin !== self.origin) return;
      var handler = self.handlers.get(event.data.type);
      if(typeof handler === 'function') {
        handler(event.data);
      }
    });
  };

  global.FrameBridge = FrameBridge;
})(window);
