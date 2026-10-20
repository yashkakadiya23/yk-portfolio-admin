(() => {
  const body = document.body;
  const pathMatch = window.location.pathname.match(/^\/case-study\/([^/]+)$/);
  const slug = pathMatch ? decodeURIComponent(pathMatch[1]) : 'health-wellness-case-study';
  const year = document.getElementById('caseYear');
  if (year) year.textContent = new Date().getFullYear();

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function setText(selector, value) {
    const target = document.querySelector(selector);
    if (target) target.textContent = value || '';
  }

  function metricCard(metric, key = false) {
    const card = node('article', key ? 'case-key-card' : 'case-metric');
    if (metric.estimated) card.classList.add(key ? 'case-key-card-estimate' : 'case-metric-estimate');
    if (key) {
      card.append(node('span', 'case-card-icon', metric.estimated ? '≈' : '↗'));
      card.append(node('p', '', metric.label.toUpperCase()));
      card.append(node('strong', '', metric.value));
      if (metric.description) card.append(node('small', '', metric.description));
    } else {
      card.append(node('span', '', metric.label));
      card.append(node('strong', '', metric.value));
      if (metric.description || metric.estimated) {
        card.append(node('small', '', `${metric.description || ''}${metric.description && metric.estimated ? ' · ' : ''}${metric.estimated ? 'Estimate' : ''}`));
      }
    }
    return card;
  }

  function createList(text) {
    const list = node('ul', 'case-interest-list');
    const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    lines.forEach(line => {
      const item = node('li', '', line.replace(/^[-•]\s*/, ''));
      list.append(item);
    });
    return list;
  }

  function showUnavailable(message) {
    body.style.visibility = 'visible';
    const main = document.querySelector('main');
    if (main) {
      main.replaceChildren(node('section', 'case-section case-unavailable', message));
    }
  }

  function render(project) {
    const title = document.querySelector('.case-hero h1');
    const separator = project.title.indexOf('—');
    if (separator > -1) {
      const emphasis = node('span', '', project.title.slice(separator + 1).trim());
      title.replaceChildren(document.createTextNode(`${project.title.slice(0, separator).trim()} — `), emphasis);
    } else {
      title.textContent = project.title;
    }
    document.title = `${project.title} | Yash Kakadiya`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', project.description || project.title);

    const eyebrow = document.querySelector('.case-hero-copy .case-eyebrow');
    const indicator = eyebrow.querySelector('span');
    eyebrow.replaceChildren(...(indicator ? [indicator, document.createTextNode(' ')] : []), document.createTextNode(`${(project.channels || []).join(' · ')} · ${project.businessType || 'CASE STUDY'}`.toUpperCase()));
    setText('.case-hero-intro', project.description);
    const heroMeta = document.querySelector('.case-hero-meta');
    heroMeta.replaceChildren();
    [
      ['CHANNEL', (project.channels || []).join(', ')],
      ['CONVERSION', project.channels?.[1] || project.objectives],
      ['MARKET', project.location]
    ].filter(([, value]) => value).forEach(([label, value]) => {
      const span = node('span');
      span.append(node('small', '', label), node('b', '', value));
      heroMeta.append(span);
    });
    setText('.case-hero-aside h2', project.objectives || 'Campaign objectives');
    setText('.case-hero-aside > p:not(.case-aside-label)', project.resultsKind === 'estimated'
      ? 'Performance figures shown here are estimates.'
      : 'Campaign results and estimated outcomes are clearly identified below.');
    const heroBottom = document.querySelector('.case-hero-bottom');
    if (heroBottom) heroBottom.lastElementChild.textContent = `${project.categoryName || 'CASE STUDY'} · ${project.subcategoryName || project.businessType || ''}`.toUpperCase();

    const metrics = [...(project.metrics || [])].sort((a, b) => a.order - b.order);
    let keyMetrics = [
      metrics.find(item => /total leads/i.test(item.label)),
      metrics.find(item => /average cost per lead/i.test(item.label)),
      metrics.find(item => /ad spend/i.test(item.label)),
      metrics.find(item => /total reach/i.test(item.label))
    ].filter(Boolean);
    if (!keyMetrics.length) keyMetrics = metrics.slice(0, 4);
    const keyResults = document.querySelector('.case-key-results');
    keyResults.replaceChildren(...keyMetrics.map((item, index) => {
      const card = metricCard(item, true);
      if (index === 0) card.classList.add('case-key-card-primary');
      return card;
    }));
    const metricGrid = document.querySelector('.case-metric-grid');
    metricGrid.replaceChildren(...metrics.map(item => metricCard(item)));
    const hasEstimates = metrics.some(item => item.estimated) || project.resultsKind === 'estimated' || project.resultsKind === 'mixed';
    setText('.case-results-section .case-section-heading > p', 'Selected campaign outcomes and performance metrics.');
    setText('.case-dashboard .case-section-heading > p', 'Results are shown as supplied; estimated outcomes are clearly labelled.');
    const disclaimer = document.querySelector('.case-estimate-disclaimer');
    disclaimer.hidden = !hasEstimates;
    disclaimer.lastChild.textContent = hasEstimates
      ? ' Any figures marked as estimates are indicative, not confirmed business outcomes.'
      : ' All displayed campaign results are marked as actual.';

    setText('.case-overview-heading > p:last-child', project.description);
    const overview = document.querySelector('.case-overview-grid');
    overview.replaceChildren();
    [
      ['Business type', project.businessType],
      ['Marketing channels', (project.channels || []).join(', ')],
      ['Conversion method', project.channels?.[1] || ''],
      ['Objective', project.objectives],
      ['Target locations', project.location],
      ['Campaign duration', project.campaignDuration]
    ].filter(([, value]) => value).forEach(([label, value]) => {
      const wrapper = node('div');
      wrapper.append(node('dt', '', label), node('dd', '', value));
      overview.append(wrapper);
    });

    const audienceLines = String(project.audience || '').split(/\r?\n/);
    const audienceSummary = audienceLines.shift() || project.audience || '';
    setText('.case-audience-heading > p', audienceSummary);
    const audienceContent = document.querySelector('.case-audience-content');
    setText('.case-audience-content > h3', 'Audience details');
    const oldList = audienceContent.querySelector('.case-interest-list');
    const interests = audienceLines.filter(line => !/^audience interests:$/i.test(line)).join('\n');
    if (oldList) oldList.replaceWith(createList(interests || audienceSummary));
    const approach = audienceContent.querySelector('.case-approach-note p');
    if (approach) {
      approach.replaceChildren(node('b', '', 'Campaign strategy'), document.createElement('br'), document.createTextNode(project.strategy || 'No additional strategy details supplied.'));
    }

    const gallerySection = document.querySelector('.case-gallery');
    setText('.case-gallery .case-section-heading > p', 'Project images, campaign screenshots, and ad creative examples.');
    const galleryGrid = node('div', 'case-gallery-grid');
    const images = [...(project.images || [])].sort((a, b) => a.order - b.order);
    const lightbox = document.getElementById('screenshotLightbox');
    const lightboxImage = lightbox.querySelector('img');
    const lightboxCaption = document.getElementById('lightboxCaption');
    images.forEach(image => {
      const button = node('button', 'case-screenshot-button');
      button.type = 'button';
      button.setAttribute('aria-label', `Enlarge ${image.alt || image.kind || 'project image'}`);
      const toolbar = node('span', 'case-screenshot-toolbar');
      toolbar.append(node('span', '', '● ● ●'), node('span', '', (image.kind || 'PROJECT IMAGE').toUpperCase()), node('span', '', 'OPEN IMAGE ↗'));
      const img = node('img');
      img.src = image.url;
      img.alt = image.alt || project.title;
      img.loading = 'lazy';
      button.append(toolbar, img);
      button.addEventListener('click', () => {
        lightboxImage.src = image.url;
        lightboxImage.alt = image.alt || project.title;
        lightboxCaption.textContent = image.alt || `${project.title} · ${image.kind || 'project image'}`;
        lightbox.showModal();
      });
      galleryGrid.append(button);
    });
    const galleryButton = document.getElementById('screenshotZoom');
    if (galleryButton) {
      const galleryParent = galleryButton.parentElement;
      galleryButton.remove();
      galleryParent.insertBefore(galleryGrid, galleryParent.querySelector('.case-gallery-caption'));
    }
    if (!images.length) gallerySection.hidden = true;
    const caption = document.querySelector('.case-gallery-caption');
    if (caption) caption.textContent = images.length ? `${images.length} project image${images.length === 1 ? '' : 's'} · Campaign materials supplied for this case study` : '';

    const summaryCopy = document.querySelector('.case-summary-copy');
    summaryCopy.replaceChildren(node('p', '', project.resultsSummary || project.description));
    if (project.audience) summaryCopy.append(node('p', '', `Audience: ${project.audience.replace(/\r?\n/g, ' ')}`));
    setText('#summary-title', project.resultsKind === 'estimated' ? 'An estimated campaign outcome.' : 'A measurable campaign.');
    const footerDescription = document.querySelector('.case-footer > small');
    if (footerDescription) footerDescription.textContent = `© ${new Date().getFullYear()} Yash Kakadiya. ${project.title}`;

    const zoomButton = document.getElementById('screenshotZoom');
    const closeButton = document.getElementById('closeLightbox');
    if (closeButton) closeButton.addEventListener('click', () => lightbox.close());
    lightbox.addEventListener('click', event => {
      if (event.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener('close', () => zoomButton?.focus());
    document.getElementById('loadingScreen')?.remove();
    body.style.visibility = 'visible';
  }

  fetch(`/api/portfolio/projects/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    .then(async response => {
      if (!response.ok) throw new Error(response.status === 404 ? 'This case study is not currently published.' : 'Could not load this case study.');
      return response.json();
    })
    .then(render)
    .catch(error => {
      if (error.message.includes('not currently published')) {
        window.location.replace('/#industries');
        return;
      }
      console.error('Could not load case study:', error);
      showUnavailable('This case study could not be loaded right now. Please return to the portfolio and try again.');
    });
})();
