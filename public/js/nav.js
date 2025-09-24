(function(){
  function normalizePath(path){
    var normalized = (path || "/");
    if (normalized.length > 1) {
      normalized = normalized.replace(/\/+$/, '/');
    }
    if (!normalized) normalized = '/';
    return normalized.toLowerCase();
  }

  function activeKey(path){
    path = normalizePath(path);
    if (path === "/") return "home";
    if (path.startsWith("/scrape")) return "scrape";
    if (path.startsWith("/sports")) return "sports";
    if (path.startsWith("/companies")) return "companies";
    if (path.startsWith("/targets")) return "targets";
    if (path.startsWith("/nda")) return "nda";
    return "";
  }
  function setActive(){
    var key = activeKey(location.pathname || '/');
    var nav = document.querySelector('.site-nav');
    if(!nav) return;
    nav.querySelectorAll('a[data-nav]').forEach(function(a){
      var on = a.getAttribute('data-nav') === key;
      if(on){ a.classList.add('active'); a.setAttribute('aria-current','page'); }
      else{ a.classList.remove('active'); a.removeAttribute('aria-current'); }
    });
  }
  document.addEventListener('DOMContentLoaded', setActive);
})();
