(function(global){
  function normalizePath(path){
    var normalized = (path || '/');
    if (normalized.length > 1) {
      normalized = normalized.replace(/\/+$/, '/');
    }
    if (!normalized) normalized = '/';
    return normalized.toLowerCase();
  }

  function activeKey(path){
    path = normalizePath(path);
    if (path === '/') return 'home';
    if (path.startsWith('/scrape') || path.startsWith('/sports') || path.startsWith('/companies')) return 'scrape';
    if (path.startsWith('/targets')) return 'targets';
    if (path.startsWith('/nda')) return 'nda';
    return '';
  }

  function setActive(){
    var key = activeKey(global.location && global.location.pathname || '/');
    var nav = document.querySelector('.site-nav');
    if(!nav) return;
    nav.querySelectorAll('a[data-nav]').forEach(function(a){
      var on = a.getAttribute('data-nav') === key;
      if(on){ a.classList.add('active'); a.setAttribute('aria-current','page'); }
      else{ a.classList.remove('active'); a.removeAttribute('aria-current'); }
    });
  }

  function initNavToggle(){
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.site-nav');
    if(!toggle || !nav) return;

    function setOpen(open){
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if(open || global.innerWidth > 820){
        nav.removeAttribute('hidden');
      } else {
        nav.setAttribute('hidden', '');
      }
    }

    setOpen(false);

    toggle.addEventListener('click', function(){
      var isOpen = toggle.getAttribute('aria-expanded') === 'true';
      setOpen(!isOpen);
      if(!isOpen){
        var firstLink = nav.querySelector('a');
        if(firstLink) firstLink.focus();
      }
    });

    nav.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){
        setOpen(false);
        toggle.focus();
      }
    });

    global.addEventListener('resize', function(){
      if(global.innerWidth > 820){
        nav.classList.remove('is-open');
        nav.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'false');
      } else if(toggle.getAttribute('aria-expanded') !== 'true') {
        nav.setAttribute('hidden', '');
      }
    });
  }

  function initKeyboardNavigation(){
    var nav = document.querySelector('.site-nav');
    if(!nav) return;
    nav.addEventListener('keydown', function(e){
      if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var links = Array.from(nav.querySelectorAll('a[data-nav]'));
      if(!links.length) return;
      var index = links.indexOf(document.activeElement);
      if(index === -1) return;
      e.preventDefault();
      var nextIndex = e.key === 'ArrowRight' ? (index + 1) % links.length : (index - 1 + links.length) % links.length;
      links[nextIndex].focus();
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    setActive();
    initNavToggle();
    initKeyboardNavigation();
  });
})(window);
