(function() {
  'use strict';

  const NAV_LINKS = [
    { href: '/', label: 'Tools', id: 'tools' },
    { href: '/news/', label: 'News', id: 'news' },
    { href: '/sports/', label: 'Sports', id: 'sports' },
    { href: '/companies/', label: 'Companies', id: 'companies' },
    { href: '/targets/', label: 'Targets', id: 'targets' },
    { href: '/nda/', label: 'NDA', id: 'nda' }
  ];

  function renderNavigation(root, activeId) {
    if (!root) {
      return null;
    }

    const navContainer = document.createElement('header');
    navContainer.className = 'header';

    const brand = document.createElement('div');
    brand.className = 'brand';
    brand.textContent = 'EdgeScraperPro';
    navContainer.appendChild(brand);

    const nav = document.createElement('nav');
    nav.className = 'nav';

    NAV_LINKS.forEach(link => {
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.textContent = link.label;
      anchor.setAttribute('data-nav-id', link.id);

      if (activeId === link.id) {
        anchor.classList.add('active');
        anchor.setAttribute('aria-current', 'page');
      }

      nav.appendChild(anchor);
    });

    navContainer.appendChild(nav);

    root.replaceChildren(navContainer);
    return root;
  }

  window.EdgeComponents = window.EdgeComponents || {};
  window.EdgeComponents.renderNavigation = renderNavigation;
})();
