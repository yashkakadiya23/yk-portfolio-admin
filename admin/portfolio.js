(() => {
  const workspace = document.getElementById('portfolioWorkspace');
  if (!workspace) return;

  const state = {
    token: '',
    data: { categories: [], subcategories: [], projects: [] },
    type: 'categories',
    selectedId: '',
    query: '',
    status: 'all',
    category: 'all',
    sort: 'order',
    images: [],
    thumbnail: '',
    categoryImage: '',
    objectUrls: []
  };
  const list = document.getElementById('portfolioList');
  const form = document.getElementById('portfolioForm');
  const fields = document.getElementById('portfolioFields');
  const editorEmpty = document.getElementById('portfolioEditorEmpty');
  const saveStatus = document.getElementById('portfolioSaveStatus');
  const typeNames = { categories: 'Category', subcategories: 'Subcategory', projects: 'Project' };
  const titleNames = { categories: 'Categories', subcategories: 'Subcategories', projects: 'Projects & case studies' };
  const collectionUrl = '/api/admin/portfolio';

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function responseData(response) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: text || 'Request failed.' };
    }
  }

  async function request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${state.token}`);
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { ...options, headers, cache: 'no-store' });
    const data = await responseData(response);
    if (!response.ok) throw new Error(data.error || 'Could not complete the portfolio request.');
    return data;
  }

  function setSaveStatus(message, error = false) {
    saveStatus.textContent = message;
    saveStatus.style.color = error ? '#b42318' : '';
  }

  function currentItems() {
    return state.data[state.type] || [];
  }

  function currentItem() {
    return currentItems().find(item => item.id === state.selectedId) || null;
  }

  function releasePreviewUrls() {
    state.objectUrls.forEach(url => URL.revokeObjectURL(url));
    state.objectUrls = [];
  }

  async function imageSource(url) {
    if (!url.startsWith('/api/portfolio/uploads/')) return url;
    const filename = url.split('/').pop();
    const response = await fetch(`/api/admin/portfolio/uploads/${encodeURIComponent(filename)}`, {
      headers: { Authorization: `Bearer ${state.token}` },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Could not load the uploaded image.');
    const blobUrl = URL.createObjectURL(await response.blob());
    state.objectUrls.push(blobUrl);
    return blobUrl;
  }

  function makeField(labelText, name, value = '', options = {}) {
    if (options.type === 'checkbox') {
      const label = element('label', 'checkbox-field');
      const input = element('input');
      input.type = 'checkbox';
      input.name = name;
      input.checked = value === true;
      label.append(input, document.createTextNode(labelText));
      return label;
    }
    const label = element('label', options.wide ? 'wide' : '');
    label.append(document.createTextNode(labelText));
    let input;
    if (options.type === 'textarea') {
      input = element('textarea');
      input.value = value || '';
      if (options.rows) input.rows = options.rows;
    } else if (options.type === 'select') {
      input = element('select');
      for (const optionData of options.options || []) {
        const option = element('option', '', optionData.label);
        option.value = optionData.value;
        option.selected = optionData.value === value;
        input.append(option);
      }
    } else {
      input = element('input');
      input.type = options.type || 'text';
      input.value = value || '';
      if (options.required) input.required = true;
      if (options.accept) input.accept = options.accept;
      if (options.multiple) input.multiple = true;
    }
    input.name = name;
    label.append(input);
    if (options.help) label.append(element('small', 'form-help', options.help));
    return label;
  }

  function categoryOptions(selected = '') {
    return [
      { value: '', label: 'Choose a category' },
      ...state.data.categories.map(item => ({ value: item.id, label: item.name }))
    ];
  }

  function renderList() {
    releasePreviewUrls();
    list.replaceChildren();
    let items = [...currentItems()];
    const query = state.query.toLocaleLowerCase();
    items = items.filter(item => {
      if (state.type === 'projects') {
        if (state.status !== 'all' && item.status !== state.status) return false;
        if (state.category !== 'all' && item.categoryId !== state.category) return false;
      }
      const label = `${item.name || item.title || ''} ${item.description || ''}`.toLocaleLowerCase();
      return !query || label.includes(query);
    });
    if (state.sort === 'name') items.sort((a, b) => (a.name || a.title).localeCompare(b.name || b.title));
    if (state.sort === 'recent') items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    if (state.sort === 'order') items.sort((a, b) => (a.order || 0) - (b.order || 0));

    if (!items.length) {
      list.append(element('div', 'image-empty', `No ${titleNames[state.type].toLocaleLowerCase()} match this view yet.`));
      return;
    }

    const canReorder = state.sort === 'order' && !state.query && state.status === 'all' && state.category === 'all';
    items.forEach((item, index) => {
      const row = element('div', `portfolio-item${item.id === state.selectedId ? ' selected' : ''}`);
      const select = element('button', 'portfolio-item-main');
      select.type = 'button';
      select.addEventListener('click', () => {
        state.selectedId = item.id;
        renderList();
        renderEditor();
      });
      const title = element('b', '', item.name || item.title);
      let detail = '';
      if (state.type === 'categories') detail = `${item.visible ? 'Visible' : 'Hidden'} · ${state.data.subcategories.filter(sub => sub.categoryId === item.id).length} subcategories`;
      if (state.type === 'subcategories') detail = `${state.data.categories.find(category => category.id === item.categoryId)?.name || 'Category'} · ${state.data.projects.filter(project => project.subcategoryId === item.id).length} projects`;
      if (state.type === 'projects') detail = `${item.status === 'published' ? 'Published' : 'Draft'} · ${state.data.categories.find(category => category.id === item.categoryId)?.name || 'No category'}`;
      select.append(title, element('small', '', detail));
      row.append(select);

      const actions = element('div', 'portfolio-item-actions');
      if (canReorder) {
        for (const [offset, label] of [[-1, 'Move up'], [1, 'Move down']]) {
          const button = element('button', '', offset < 0 ? '↑' : '↓');
          button.type = 'button';
          button.title = label;
          button.setAttribute('aria-label', `${label}: ${item.name || item.title}`);
          button.disabled = index + offset < 0 || index + offset >= items.length;
          button.addEventListener('click', () => moveItem(item.id, offset));
          actions.append(button);
        }
      }
      row.append(actions);
      list.append(row);
    });
  }

  async function moveItem(id, offset) {
    const items = [...state.data[state.type]].sort((a, b) => (a.order || 0) - (b.order || 0));
    const index = items.findIndex(item => item.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    try {
      await request(`${collectionUrl}/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ type: state.type, ids: items.map(item => item.id) })
      });
      await loadData();
    } catch (error) {
      setSaveStatus(error.message, true);
    }
  }

  async function uploadImages(files, kind) {
    if (!files.length) return [];
    const body = new FormData();
    body.append('kind', kind);
    files.forEach(file => body.append('images', file));
    return (await request(`${collectionUrl}/uploads`, { method: 'POST', body })).images;
  }

  function addImageUpload(parent, multiple, kind = 'gallery') {
    const control = element('div', 'upload-control');
    const input = element('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.multiple = multiple;
    input.setAttribute('aria-label', 'Upload image files');
    const kindSelect = element('select');
    for (const [value, label] of [['gallery', 'Gallery image'], ['creative', 'Ad creative'], ['screenshot', 'Campaign screenshot']]) {
      const option = element('option', '', label);
      option.value = value;
      option.selected = value === kind;
      kindSelect.append(option);
    }
    const hint = element('small', 'form-help', 'PNG, JPEG, WebP, or GIF · up to 8 MB per image.');
    control.append(input, kindSelect, hint);
    parent.append(control);
    return { input, kindSelect };
  }

  async function renderGallery() {
    const gallery = document.getElementById('projectGallery');
    if (!gallery) return;
    releasePreviewUrls();
    gallery.replaceChildren();
    if (!state.images.length) {
      gallery.append(element('div', 'image-empty', 'No project images yet. Upload screenshots, ad creatives, or gallery images.'));
      return;
    }
    for (const [index, image] of state.images.entries()) {
      const row = element('article', 'gallery-item');
      const img = element('img');
      img.alt = image.alt || 'Project image preview';
      try {
        img.src = await imageSource(image.url);
      } catch (error) {
        img.alt = error.message;
      }
      const detail = element('div', 'gallery-item-main');
      const name = image.alt || image.url.split('/').pop();
      detail.append(element('b', '', name), element('small', '', `${image.kind || 'gallery'} · ${image.url}`));
      const buttons = element('div', 'gallery-item-actions');
      const up = element('button', '', '↑');
      up.type = 'button';
      up.title = 'Move image up';
      up.disabled = index === 0;
      up.addEventListener('click', () => moveGalleryImage(index, -1));
      const down = element('button', '', '↓');
      down.type = 'button';
      down.title = 'Move image down';
      down.disabled = index === state.images.length - 1;
      down.addEventListener('click', () => moveGalleryImage(index, 1));
      const remove = element('button', '', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        const removed = state.images[index].url;
        state.images.splice(index, 1);
        if (state.thumbnail === removed) state.thumbnail = state.images[0]?.url || '';
        updateThumbnailOptions();
        renderGallery();
      });
      buttons.append(up, down, remove);
      row.append(img, detail, buttons);
      gallery.append(row);
    }
  }

  function moveGalleryImage(index, offset) {
    const target = index + offset;
    if (target < 0 || target >= state.images.length) return;
    [state.images[index], state.images[target]] = [state.images[target], state.images[index]];
    renderGallery();
  }

  function updateThumbnailOptions() {
    const select = fields.querySelector('[name=thumbnail]');
    if (!select) return;
    const selectedUrl = state.images.some(image => image.url === state.thumbnail) ? state.thumbnail : state.images[0]?.url || '';
    state.thumbnail = selectedUrl;
    select.replaceChildren();
    if (!state.images.length) {
      select.append(element('option', '', 'Upload a project image first'));
      select.value = '';
      return;
    }
    state.images.forEach((image, index) => {
      const option = element('option', '', image.alt || `Image ${index + 1} · ${image.kind || 'gallery'}`);
      option.value = image.url;
      option.selected = image.url === selectedUrl;
      select.append(option);
    });
    select.value = selectedUrl;
  }

  function readMetrics() {
    return [...fields.querySelectorAll('.metric-row')].map((row, index) => ({
      id: row.dataset.id || '',
      label: row.querySelector('[name=metricLabel]').value,
      value: row.querySelector('[name=metricValue]').value,
      description: row.querySelector('[name=metricDescription]').value,
      estimated: row.querySelector('[name=metricEstimated]').checked,
      order: index
    }));
  }

  function renderMetrics(metrics = []) {
    const container = document.getElementById('projectMetrics');
    if (!container) return;
    container.replaceChildren();
    if (!metrics.length) container.append(element('div', 'image-empty', 'Add the campaign results you want visitors to see.'));
    metrics.forEach((metric, index) => {
      const row = element('div', 'metric-row');
      row.dataset.id = metric.id || '';
      const data = element('div', 'metric-row-fields');
      const label = makeField('Metric label', 'metricLabel', metric.label, { required: true });
      label.classList.add('metric-label');
      const value = makeField('Value', 'metricValue', metric.value, { required: true });
      const description = makeField('Optional description', 'metricDescription', metric.description, { wide: true });
      description.classList.add('metric-description');
      const estimated = makeField('Estimated result', 'metricEstimated', metric.estimated === true, { type: 'checkbox' });
      estimated.classList.add('checkbox-field');
      data.append(label, value, description, estimated);
      const controls = element('div', 'metric-actions');
      const up = element('button', '', '↑');
      up.type = 'button';
      up.disabled = index === 0;
      up.addEventListener('click', () => reorderMetrics(index, -1));
      const down = element('button', '', '↓');
      down.type = 'button';
      down.disabled = index === metrics.length - 1;
      down.addEventListener('click', () => reorderMetrics(index, 1));
      const remove = element('button', '', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        const next = readMetrics();
        next.splice(index, 1);
        renderMetrics(next);
      });
      controls.append(up, down, remove);
      row.append(data, controls);
      container.append(row);
    });
  }

  function reorderMetrics(index, offset) {
    const metrics = readMetrics();
    const target = index + offset;
    if (target < 0 || target >= metrics.length) return;
    [metrics[index], metrics[target]] = [metrics[target], metrics[index]];
    renderMetrics(metrics);
  }

  function renderEditor() {
    releasePreviewUrls();
    const item = currentItem();
    if (!state.selectedId && !state.isNew) {
      form.classList.add('hidden');
      editorEmpty.classList.remove('hidden');
      return;
    }
    const value = item || {};
    form.classList.remove('hidden');
    editorEmpty.classList.add('hidden');
    form.dataset.entityId = item?.id || '';
    document.getElementById('portfolioTypeLabel').textContent = typeNames[state.type].toUpperCase();
    document.getElementById('portfolioFormTitle').textContent = item ? `Edit ${typeNames[state.type].toLowerCase()}` : `New ${typeNames[state.type].toLowerCase()}`;
    document.getElementById('portfolioFormActions').replaceChildren();
    fields.replaceChildren();
    setSaveStatus('');

    if (state.type === 'categories') {
      state.categoryImage = value.image || '';
      fields.append(
        makeField('Category name', 'name', value.name, { required: true }),
        makeField('Display number', 'number', value.number, { help: 'Shown above the category title, e.g. 01.' }),
        makeField('Small label (optional)', 'sector', value.sector, { help: 'Preserves labels such as B2B, ENERGY, or RETAIL.' }),
        makeField('Icon or symbol', 'icon', value.icon || '↗'),
        makeField('Card colour', 'color', value.color || '#1769e0', { type: 'color' }),
        makeField('Description', 'description', value.description, { type: 'textarea', wide: true }),
        makeField('Show this category on the website', 'visible', value.visible !== false, { type: 'checkbox' })
      );
      const imageBlock = element('div', 'wide');
      imageBlock.append(element('span', '', 'Category image'));
      const uploader = addImageUpload(imageBlock, false);
      const preview = element('img', 'upload-preview');
      preview.hidden = !state.categoryImage;
      if (state.categoryImage) {
        imageSource(state.categoryImage).then(src => { preview.src = src; }).catch(error => setSaveStatus(error.message, true));
      }
      imageBlock.append(preview);
      fields.append(imageBlock);
      uploader.input.addEventListener('change', async () => {
        if (!uploader.input.files.length) return;
        setSaveStatus('Uploading image…');
        try {
          const [image] = await uploadImages([...uploader.input.files].slice(0, 1), uploader.kindSelect.value);
          state.categoryImage = image.url;
          preview.src = await imageSource(image.url);
          preview.hidden = false;
          setSaveStatus('Image uploaded. Save the category to apply it.');
        } catch (error) {
          setSaveStatus(error.message, true);
        }
      });
    } else if (state.type === 'subcategories') {
      fields.append(
        makeField('Parent category', 'categoryId', value.categoryId, { type: 'select', options: categoryOptions(), required: true }),
        makeField('Subcategory name', 'name', value.name, { required: true }),
        makeField('Icon or symbol', 'icon', value.icon || '✦'),
        makeField('Description', 'description', value.description, { type: 'textarea', wide: true }),
        makeField('Show this subcategory on the website', 'visible', value.visible !== false, { type: 'checkbox' })
      );
    } else {
      state.images = item ? item.images.map(image => ({ ...image })) : [];
      state.thumbnail = value.thumbnail || state.images[0]?.url || '';
      fields.append(
        makeField('Project title', 'title', value.title, { required: true, wide: true }),
        makeField('Category', 'categoryId', value.categoryId, { type: 'select', options: categoryOptions(), required: true }),
        makeField('Subcategory', 'subcategoryId', value.subcategoryId, {
          type: 'select',
          options: [
            { value: '', label: 'No subcategory' },
            ...state.data.subcategories.map(subcategory => ({
              value: subcategory.id,
              label: `${state.data.categories.find(category => category.id === subcategory.categoryId)?.name || 'Category'} — ${subcategory.name}`
            }))
          ]
        }),
        makeField('Business type', 'businessType', value.businessType, { help: 'For example B2B or B2C.' }),
        makeField('Location / market', 'location', value.location),
        makeField('Campaign duration', 'campaignDuration', value.campaignDuration),
        makeField('Marketing channels', 'channels', (value.channels || []).join('\n'), { type: 'textarea', help: 'Use one channel per line, e.g. Meta Ads.' }),
        makeField('Project description', 'description', value.description, { type: 'textarea', wide: true }),
        makeField('Campaign objectives', 'objectives', value.objectives, { type: 'textarea', wide: true }),
        makeField('Audience details', 'audience', value.audience, { type: 'textarea', wide: true }),
        makeField('Strategy', 'strategy', value.strategy, { type: 'textarea', wide: true }),
        makeField('Results summary', 'resultsSummary', value.resultsSummary, { type: 'textarea', wide: true }),
        makeField('Results type', 'resultsKind', value.resultsKind || 'actual', {
          type: 'select',
          options: [{ value: 'actual', label: 'Actual results' }, { value: 'estimated', label: 'Estimated results' }, { value: 'mixed', label: 'Mixed: actual and estimated' }]
        }),
        makeField('Publication status', 'status', value.status || 'draft', {
          type: 'select',
          options: [{ value: 'draft', label: 'Draft — hidden from visitors' }, { value: 'published', label: 'Published — visible to visitors' }]
        }),
        makeField('Feature this project', 'featured', value.featured === true, { type: 'checkbox' })
      );
      const galleryBlock = element('div', 'wide');
      galleryBlock.append(element('span', '', 'Images, ad creatives & screenshots'));
      galleryBlock.append(element('small', 'form-help', 'Choose the image type before selecting files. Reorder the gallery and select a project thumbnail below.'));
      const uploader = addImageUpload(galleryBlock, true);
      galleryBlock.append(makeField('Project thumbnail', 'thumbnail', state.thumbnail, {
        type: 'select',
        options: state.images.length
          ? state.images.map((image, index) => ({ value: image.url, label: image.alt || `Image ${index + 1} · ${image.kind || 'gallery'}` }))
          : [{ value: '', label: 'Upload a project image first' }]
      }));
      const gallery = element('div', 'gallery-editor');
      gallery.id = 'projectGallery';
      galleryBlock.append(gallery);
      fields.append(galleryBlock);
      uploader.input.addEventListener('change', async () => {
        if (!uploader.input.files.length) return;
        setSaveStatus('Uploading images…');
        try {
          const images = await uploadImages([...uploader.input.files], uploader.kindSelect.value);
          state.images.push(...images);
          if (!state.thumbnail) state.thumbnail = images[0]?.url || '';
          updateThumbnailOptions();
          setSaveStatus(`${images.length} image${images.length === 1 ? '' : 's'} uploaded. Save the project to apply them.`);
          renderGallery();
        } catch (error) {
          setSaveStatus(error.message, true);
        } finally {
          uploader.input.value = '';
        }
      });
      fields.querySelector('[name=thumbnail]').addEventListener('change', event => { state.thumbnail = event.target.value; });
      renderGallery();

      const metricBlock = element('div', 'wide');
      metricBlock.append(element('span', '', 'Performance metrics'));
      metricBlock.append(element('small', 'form-help', 'Add actual or estimated results. Estimated metrics are clearly labelled on the case-study page.'));
      const metricEditor = element('div', 'metrics-editor');
      metricEditor.id = 'projectMetrics';
      metricBlock.append(metricEditor);
      const addMetric = element('button', 'portfolio-subtle-button', '+ Add performance metric');
      addMetric.type = 'button';
      addMetric.addEventListener('click', () => renderMetrics([...readMetrics(), { label: '', value: '', estimated: false }]));
      metricBlock.append(addMetric);
      fields.append(metricBlock);
      renderMetrics(value.metrics || []);
      fields.querySelector('[name=categoryId]').addEventListener('change', event => {
        const selectedSubcategory = fields.querySelector('[name=subcategoryId]');
        const selected = state.data.subcategories.find(subcategory => subcategory.id === selectedSubcategory.value);
        if (selected && selected.categoryId !== event.target.value) selectedSubcategory.value = '';
      });
    }

    const actions = document.getElementById('portfolioFormActions');
    const save = element('button', 'primary', item ? 'Save changes' : `Create ${typeNames[state.type].toLowerCase()}`);
    save.type = 'submit';
    actions.append(save);
    const cancel = element('button', 'portfolio-subtle-button', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', async () => {
      state.isNew = false;
      state.selectedId = '';
      await loadData();
    });
    actions.append(cancel);
    if (state.type === 'projects') {
      const preview = element('button', 'portfolio-subtle-button', 'Preview');
      preview.type = 'button';
      preview.addEventListener('click', showPreview);
      actions.append(preview);
    }
    if (item) {
      if (state.type === 'projects') {
        const duplicate = element('button', 'portfolio-subtle-button', 'Duplicate as draft');
        duplicate.type = 'button';
        duplicate.addEventListener('click', duplicateProject);
        actions.append(duplicate);
      }
      const remove = element('button', 'danger-button', `Delete ${typeNames[state.type].toLowerCase()}`);
      remove.type = 'button';
      remove.addEventListener('click', deleteItem);
      actions.append(remove);
    }
  }

  function collectForm() {
    const data = Object.fromEntries(new FormData(form));
    if (state.type === 'categories') {
      return { ...data, image: state.categoryImage, visible: fields.querySelector('[name=visible]').checked };
    }
    if (state.type === 'subcategories') {
      return { ...data, visible: fields.querySelector('[name=visible]').checked };
    }
    return {
      ...data,
      channels: data.channels.split(/[\n,]/).map(item => item.trim()).filter(Boolean),
      featured: fields.querySelector('[name=featured]').checked,
      images: state.images.map((image, order) => ({ ...image, order })),
      thumbnail: state.thumbnail,
      metrics: readMetrics()
    };
  }

  async function saveItem(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const saveButton = form.querySelector('.portfolio-form-actions .primary');
    saveButton.disabled = true;
    setSaveStatus('Saving…');
    try {
      const payload = collectForm();
      const id = form.dataset.entityId;
      const url = id ? `${collectionUrl}/${state.type}/${encodeURIComponent(id)}` : `${collectionUrl}/${state.type}`;
      const saved = await request(url, { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      state.selectedId = saved.id;
      state.isNew = false;
      if (await loadData()) setSaveStatus('Saved.');
    } catch (error) {
      setSaveStatus(error.message, true);
    } finally {
      saveButton.disabled = false;
    }
  }

  async function deleteItem() {
    const item = currentItem();
    if (!item || !window.confirm(`Delete “${item.name || item.title}”? This cannot be undone.`)) return;
    try {
      await request(`${collectionUrl}/${state.type}/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      state.selectedId = '';
      state.isNew = false;
      await loadData();
    } catch (error) {
      setSaveStatus(error.message, true);
    }
  }

  async function duplicateProject() {
    const item = currentItem();
    if (!item) return;
    try {
      const copy = await request(`${collectionUrl}/projects/${encodeURIComponent(item.id)}/duplicate`, { method: 'POST', body: '{}' });
      state.type = 'projects';
      state.selectedId = copy.id;
      state.isNew = false;
      await loadData();
    } catch (error) {
      setSaveStatus(error.message, true);
    }
  }

  function showPreview() {
    const data = collectForm();
    document.getElementById('projectPreviewTitle').textContent = data.title || 'Case study preview';
    const body = document.getElementById('projectPreviewBody');
    body.replaceChildren();
    const article = element('article', 'preview-project');
    if (data.status !== 'published') article.append(element('p', 'preview-note', 'Draft preview · visitors cannot see this project until it is published.'));
    article.append(element('h3', '', data.title || 'Untitled project'));
    article.append(element('p', '', data.description || 'Add a project description to complete this preview.'));
    const meta = element('div', 'preview-project-meta');
    const category = state.data.categories.find(item => item.id === data.categoryId);
    const subcategory = state.data.subcategories.find(item => item.id === data.subcategoryId);
    [category?.name, subcategory?.name, data.businessType, data.location, data.campaignDuration, ...data.channels].filter(Boolean)
      .forEach(item => meta.append(element('span', '', item)));
    article.append(meta);
    const metrics = element('div', 'preview-metrics');
    data.metrics.filter(metric => metric.label && metric.value).forEach(metric => {
      const card = element('article');
      card.append(element('b', '', metric.label), element('strong', '', metric.value));
      if (metric.description) card.append(element('small', '', metric.description));
      if (metric.estimated) card.append(element('span', 'preview-estimate', 'Estimated'));
      metrics.append(card);
    });
    article.append(metrics);
    for (const [label, value] of [['Objectives', data.objectives], ['Audience', data.audience], ['Strategy', data.strategy], ['Results', data.resultsSummary]]) {
      if (!value) continue;
      article.append(element('h4', '', label), element('p', '', value));
    }
    const gallery = element('div', 'preview-gallery');
    for (const image of data.images) {
      const img = element('img');
      img.alt = image.alt || data.title;
      imageSource(image.url).then(src => { img.src = src; }).catch(() => {});
      gallery.append(img);
    }
    if (data.images.length) article.append(gallery);
    body.append(article);
    document.getElementById('projectPreviewDialog').showModal();
  }

  async function loadData() {
    try {
      state.data = await request(collectionUrl);
      const filter = document.getElementById('projectCategoryFilter');
      const previousCategory = state.category;
      filter.replaceChildren(element('option', '', 'All categories'));
      filter.firstElementChild.value = 'all';
      state.data.categories.forEach(category => {
        const option = element('option', '', category.name);
        option.value = category.id;
        filter.append(option);
      });
      state.category = [...filter.options].some(option => option.value === previousCategory) ? previousCategory : 'all';
      filter.value = state.category;
      if (state.selectedId && !currentItems().some(item => item.id === state.selectedId)) state.selectedId = '';
      renderList();
      renderEditor();
      return true;
    } catch (error) {
      list.replaceChildren(element('div', 'image-empty', error.message));
      return false;
    }
  }

  function setType(type) {
    state.type = type;
    state.selectedId = '';
    state.isNew = false;
    document.getElementById('portfolioListTitle').textContent = titleNames[type];
    document.getElementById('projectStatusFilterWrap').classList.toggle('hidden', type !== 'projects');
    document.getElementById('projectCategoryFilterWrap').classList.toggle('hidden', type !== 'projects');
    document.querySelectorAll('[data-portfolio-type]').forEach(button => {
      const active = button.dataset.portfolioType === type;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    renderList();
    renderEditor();
  }

  document.querySelectorAll('[data-workspace]').forEach(button => {
    button.addEventListener('click', () => {
      const showPortfolio = button.dataset.workspace === 'portfolioWorkspace';
      document.getElementById('leadsWorkspace').classList.toggle('hidden', showPortfolio);
      workspace.classList.toggle('hidden', !showPortfolio);
      document.querySelectorAll('[data-workspace]').forEach(tab => tab.classList.toggle('active', tab === button));
      if (showPortfolio) loadData();
    });
  });
  document.querySelectorAll('[data-portfolio-type]').forEach(button => button.addEventListener('click', () => setType(button.dataset.portfolioType)));
  document.getElementById('portfolioSearch').addEventListener('input', event => {
    state.query = event.target.value.trim();
    renderList();
  });
  document.getElementById('projectStatusFilter').addEventListener('change', event => {
    state.status = event.target.value;
    renderList();
  });
  document.getElementById('projectCategoryFilter').addEventListener('change', event => {
    state.category = event.target.value;
    renderList();
  });
  document.getElementById('portfolioSort').addEventListener('change', event => {
    state.sort = event.target.value;
    renderList();
  });
  document.getElementById('portfolioAdd').addEventListener('click', () => {
    state.selectedId = '';
    state.isNew = true;
    renderList();
    renderEditor();
  });
  document.getElementById('portfolioRefresh').addEventListener('click', loadData);
  document.getElementById('closeProjectPreview').addEventListener('click', () => document.getElementById('projectPreviewDialog').close());
  document.getElementById('projectPreviewDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  form.addEventListener('submit', saveItem);

  window.PortfolioAdmin = {
    init(token) {
      state.token = token;
      document.querySelector('[data-workspace="leadsWorkspace"]').classList.add('active');
      setType('categories');
    },
    stop() {
      state.token = '';
      state.selectedId = '';
      state.isNew = false;
      state.data = { categories: [], subcategories: [], projects: [] };
      releasePreviewUrls();
    }
  };
})();
