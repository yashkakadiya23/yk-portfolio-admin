(() => {
  const industryGrid = document.querySelector('.industries');
  if (!industryGrid) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/industry-navigation.css';
  document.head.append(link);

  const dialog = document.createElement('dialog');
  dialog.className = 'industry-dialog';
  dialog.setAttribute('aria-labelledby', 'industryDialogTitle');
  dialog.innerHTML = `
    <div class="industry-dialog-shell">
      <button class="industry-dialog-close" type="button" aria-label="Close category projects">×</button>
      <div class="industry-dialog-content"></div>
    </div>
  `;
  document.body.append(dialog);

  const content = dialog.querySelector('.industry-dialog-content');
  const closeButton = dialog.querySelector('.industry-dialog-close');
  let categories = [];
  let subcategories = [];
  let projects = [];
  let activeCard = null;

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function categoryForSlug(slug) {
    return categories.find(category => category.slug === slug);
  }

  function subcategoryForSlug(slug, categoryId) {
    return subcategories.find(item => item.slug === slug && item.categoryId === categoryId);
  }

  function getViewFromState() {
    return window.history.state?.industryNavigation || null;
  }

  function getViewFromHash() {
    const match = window.location.hash.match(/^#industry-category\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/);
    return match ? { categorySlug: match[1], subcategorySlug: match[2] || '' } : null;
  }

  function updateHistory(view, replace = false) {
    const state = { ...window.history.state, industryNavigation: view };
    const hash = `#industry-category/${view.categorySlug}${view.subcategorySlug ? `/${view.subcategorySlug}` : ''}`;
    window.history[replace ? 'replaceState' : 'pushState'](state, '', hash);
  }

  function closeToCategories() {
    const view = getViewFromState();
    if (view?.baseUrl) {
      window.history.replaceState(view.baseState ?? null, '', view.baseUrl);
    } else {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#industries`);
    }
    if (dialog.open) dialog.close();
  }

  function projectCard(project) {
    const card = create('a', 'industry-project-card');
    card.href = `/case-study/${encodeURIComponent(project.slug)}`;
    if (project.thumbnail) {
      const image = create('img', 'industry-project-image');
      image.src = project.thumbnail;
      image.alt = '';
      image.loading = 'lazy';
      card.append(image);
    }
    const copy = create('span', 'industry-project-copy');
    const title = create('b', '', project.title);
    const intro = create('small', '', project.description || project.resultsSummary || 'View project case study.');
    const action = create('span', 'industry-project-action', project.featured ? 'Featured case study ↗' : 'View case study ↗');
    copy.append(title, intro, action);
    card.append(copy);
    return card;
  }

  function projectList(items) {
    const wrapper = create('div', 'industry-project-list');
    if (!items.length) {
      wrapper.append(create('p', 'industry-no-projects', 'There are no published projects here yet. Please check back soon.'));
      return wrapper;
    }
    items.forEach(project => wrapper.append(projectCard(project)));
    return wrapper;
  }

  function renderView(view) {
    const category = categoryForSlug(view.categorySlug);
    if (!category) {
      if (dialog.open) dialog.close();
      return;
    }
    activeCard = industryGrid.querySelector(`[data-category-id="${CSS.escape(category.id)}"]`);
    const categorySubs = subcategories.filter(item => item.categoryId === category.id);
    const directProjects = projects.filter(project => project.categoryId === category.id && !project.subcategoryId);
    content.replaceChildren();
    content.append(create('p', 'industry-dialog-eyebrow', 'INDUSTRY EXPERIENCE'));
    const title = create('h2');
    title.id = 'industryDialogTitle';
    const subcategory = view.subcategorySlug ? subcategoryForSlug(view.subcategorySlug, category.id) : null;
    title.textContent = subcategory?.name || category.name;
    content.append(title);

    if (subcategory) {
      content.append(create('p', 'industry-dialog-intro', subcategory.description || `Published projects in ${subcategory.name}.`));
      const matchingProjects = projects.filter(project => project.subcategoryId === subcategory.id);
      content.append(projectList(matchingProjects));
      const back = create('button', 'industry-dialog-back', `← Back to ${category.name}`);
      back.type = 'button';
      back.addEventListener('click', () => {
        const parentView = { ...view, subcategorySlug: '' };
        updateHistory(parentView);
        renderView(parentView);
      });
      content.append(back);
    } else {
      content.append(create('p', 'industry-dialog-intro', category.description || 'Explore published projects and case studies.'));
      if (categorySubs.length) {
        const grid = create('div', 'industry-subcategories');
        categorySubs.forEach(item => {
          const card = create('button', 'industry-subcategory');
          card.type = 'button';
          card.append(create('span', 'industry-subcategory-icon', item.icon || '✦'));
          card.append(create('h3', '', item.name));
          card.append(create('p', '', item.description || 'Explore projects in this area.'));
          const count = projects.filter(project => project.subcategoryId === item.id).length;
          card.append(create('span', 'industry-option-button', `${count ? `${count} published ${count === 1 ? 'project' : 'projects'}` : 'Explore projects'} ↗`));
          card.addEventListener('click', () => {
            const nextView = { ...view, subcategorySlug: item.slug };
            updateHistory(nextView);
            renderView(nextView);
          });
          grid.append(card);
        });
        content.append(grid);
      }
      if (directProjects.length || !categorySubs.length) {
        const heading = create('h3', 'industry-project-heading', categorySubs.length ? 'Featured in this category' : 'Published projects');
        content.append(heading, projectList(directProjects.length ? directProjects : projects.filter(project => project.categoryId === category.id)));
      }
      const back = create('button', 'industry-dialog-back', '← Back to categories');
      back.type = 'button';
      back.addEventListener('click', closeToCategories);
      content.append(back);
    }

    if (!dialog.open) dialog.showModal();
    closeButton.focus();
  }

  function openCategory(category) {
    activeCard = category.card;
    const view = {
      categorySlug: category.slug,
      subcategorySlug: '',
      baseUrl: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      baseState: window.history.state
    };
    updateHistory(view);
    renderView(view);
  }

  function renderCategories() {
    industryGrid.replaceChildren();
    categories.forEach(category => {
      const card = create('article');
      card.dataset.categoryId = category.id;
      card.style.setProperty('--industry-color', category.color || '#1769e0');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-haspopup', 'dialog');
      card.setAttribute('aria-label', `${category.name}. Open category projects`);
      const projectCount = projects.filter(project => project.categoryId === category.id).length;
      const number = category.number || String((category.order || 0) + 1).padStart(2, '0');
      const meta = category.sector ? `${number} / ${category.sector}` : `${number} / ${projectCount} PROJECT${projectCount === 1 ? '' : 'S'}`;
      card.append(create('small', '', meta));
      const symbol = create('div', 'symbol', category.icon || '↗');
      symbol.style.color = category.color || '';
      card.append(symbol);
      card.append(create('h3', '', category.name));
      card.append(create('p', '', category.description || 'Explore projects and case studies.'));
      if (category.image) {
        const image = create('img', 'industry-category-image');
        image.src = category.image;
        image.alt = '';
        image.loading = 'lazy';
        card.append(image);
      }
      category.card = card;
      card.addEventListener('click', () => openCategory(category));
      card.addEventListener('keydown', event => {
        if (event.target !== card || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        openCategory(category);
      });
      industryGrid.append(card);
    });
  }

  function syncWithHistory() {
    const view = getViewFromState() || getViewFromHash();
    if (view) renderView(view);
    else if (dialog.open) dialog.close();
  }

  closeButton.addEventListener('click', closeToCategories);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeToCategories();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) closeToCategories();
  });
  dialog.addEventListener('close', () => activeCard?.focus());
  window.addEventListener('popstate', syncWithHistory);

  fetch('/api/portfolio', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('Could not load portfolio categories.');
      return response.json();
    })
    .then(data => {
      categories = data.categories || [];
      subcategories = data.subcategories || [];
      projects = data.projects || [];
      renderCategories();
      const view = getViewFromState() || getViewFromHash();
      if (view) renderView(view);
    })
    .catch(error => {
      console.error('Could not load public portfolio content:', error);
      industryGrid.setAttribute('aria-label', 'Industry categories could not be loaded.');
    });
})();
