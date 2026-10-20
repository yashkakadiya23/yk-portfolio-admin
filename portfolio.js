const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const imageTypes = new Map([
  ['image/png', { extension: 'png', matches: bytes => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ['image/jpeg', { extension: 'jpg', matches: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ['image/webp', { extension: 'webp', matches: bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' }],
  ['image/gif', { extension: 'gif', matches: bytes => /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6)) }]
]);

function emptyString(value, limit = 2000) {
  return String(value ?? '').trim().slice(0, limit);
}

function slugify(value) {
  return emptyString(value, 160).toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || crypto.randomUUID();
}

function isSafeImageReference(value) {
  return typeof value === 'string' && (
    /^\/images\/[A-Za-z0-9_.-]+$/.test(value) ||
    /^\/api\/portfolio\/uploads\/[0-9a-f-]+\.(?:png|jpg|webp|gif)$/.test(value)
  );
}

function cleanImageReference(value) {
  const image = emptyString(value, 300);
  if (!image) return '';
  if (!isSafeImageReference(image)) throw Object.assign(new Error('Choose an uploaded image from this portfolio.'), { status: 400 });
  return image;
}

function readStore(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.subcategories) || !Array.isArray(parsed.projects)) {
    throw new Error('Portfolio data file has an invalid structure.');
  }
  return parsed;
}

function writeStore(file, store) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2), { mode: 0o600 });
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function orderByOrder(items) {
  return [...items].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

function publicProject(store, project) {
  const category = store.categories.find(item => item.id === project.categoryId);
  const subcategory = store.subcategories.find(item => item.id === project.subcategoryId);
  if (project.status !== 'published' || !category?.visible || (subcategory && (!subcategory.visible || subcategory.categoryId !== category.id))) return false;
  return { ...project, categoryName: category.name, subcategoryName: subcategory?.name || '' };
}

function removeTemporaryFiles(files) {
  for (const file of files || []) {
    try {
      fs.rmSync(file.path, { force: true });
    } catch (error) {
      console.error('Could not remove rejected portfolio upload:', error.message);
    }
  }
}

function attachPortfolioRoutes(app, { auth, root }) {
  const dataFile = process.env.PORTFOLIO_DATA_FILE || path.join(root, 'data', 'portfolio.json');
  const uploadDirectory = process.env.PORTFOLIO_UPLOAD_DIRECTORY || path.join(root, 'data', 'portfolio-uploads');
  if (!fs.existsSync(dataFile)) {
    if (process.env.PORTFOLIO_DATA_FILE) throw new Error('Configured portfolio data file does not exist.');
    const seedFile = path.join(root, 'data', 'portfolio-seed.json');
    fs.writeFileSync(dataFile, fs.readFileSync(seedFile), { flag: 'wx', mode: 0o600 });
  }
  fs.mkdirSync(uploadDirectory, { recursive: true });
  const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDirectory,
      filename: (_req, _file, callback) => callback(null, `${crypto.randomUUID()}.tmp`)
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 20 },
    fileFilter: (_req, file, callback) => {
      if (!imageTypes.has(file.mimetype)) return callback(new Error('Upload a PNG, JPEG, WebP, or GIF image.'));
      callback(null, true);
    }
  });

  const api = handler => (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) req.body = {};
      handler(req, res);
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      console.error('Portfolio API error:', error.message);
      return res.status(500).json({ error: 'Could not complete the portfolio request.' });
    }
  };

  const getStore = () => readStore(dataFile);
  const save = store => writeStore(dataFile, store);
  const timestamp = () => new Date().toISOString();
  const byId = (items, id) => items.find(item => item.id === id);
  const notFound = name => Object.assign(new Error(`${name} not found.`), { status: 404 });
  const uniqueSlug = (items, slug, currentId) => items.some(item => item.id !== currentId && item.slug === slug)
    ? `${slug}-${crypto.randomUUID().slice(0, 8)}`
    : slug;

  const normalizeCategory = (body, existing, store) => {
    const name = emptyString(body.name, 100);
    if (!name) throw Object.assign(new Error('Enter a category name.'), { status: 400 });
    const color = emptyString(body.color || '#1769e0', 20);
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw Object.assign(new Error('Enter a valid six-digit hex colour.'), { status: 400 });
    return {
      id: existing?.id || crypto.randomUUID(),
      slug: existing?.slug || uniqueSlug(store.categories, slugify(name)),
      name,
      description: emptyString(body.description, 500),
      sector: emptyString(body.sector, 50),
      icon: emptyString(body.icon || '↗', 24),
      number: emptyString(body.number || String(store.categories.length + 1).padStart(2, '0'), 20),
      color,
      image: cleanImageReference(body.image),
      visible: body.visible !== false,
      order: existing?.order ?? store.categories.length
    };
  };

  const normalizeSubcategory = (body, existing, store) => {
    const name = emptyString(body.name, 100);
    const categoryId = emptyString(body.categoryId, 100);
    if (!name) throw Object.assign(new Error('Enter a subcategory name.'), { status: 400 });
    if (!byId(store.categories, categoryId)) throw Object.assign(new Error('Choose a valid category.'), { status: 400 });
    return {
      id: existing?.id || crypto.randomUUID(),
      slug: existing?.slug || uniqueSlug(store.subcategories, slugify(name)),
      categoryId,
      name,
      description: emptyString(body.description, 500),
      icon: emptyString(body.icon || '✦', 24),
      visible: body.visible !== false,
      order: existing?.order ?? store.subcategories.filter(item => item.categoryId === categoryId).length
    };
  };

  const textList = (value, maximumItems, maximumLength = 100) => {
    const values = Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/);
    return values.map(item => emptyString(item, maximumLength)).filter(Boolean).slice(0, maximumItems);
  };

  const normalizeProject = (body, existing, store) => {
    const title = emptyString(body.title, 180);
    const categoryId = emptyString(body.categoryId, 100);
    const subcategoryId = emptyString(body.subcategoryId, 100);
    const category = byId(store.categories, categoryId);
    const subcategory = subcategoryId ? byId(store.subcategories, subcategoryId) : null;
    if (!title) throw Object.assign(new Error('Enter a project title.'), { status: 400 });
    if (!category) throw Object.assign(new Error('Choose a valid category.'), { status: 400 });
    if (subcategoryId && (!subcategory || subcategory.categoryId !== categoryId)) {
      throw Object.assign(new Error('Choose a subcategory within the selected category.'), { status: 400 });
    }
    const status = body.status === 'published' ? 'published' : 'draft';
    if (body.resultsKind && !['actual', 'estimated', 'mixed'].includes(body.resultsKind)) {
      throw Object.assign(new Error('Choose whether the results are actual, estimated, or mixed.'), { status: 400 });
    }
    const rawImages = Array.isArray(body.images) ? body.images : [];
    if (rawImages.length > 30) throw Object.assign(new Error('A project can have up to 30 images.'), { status: 400 });
    const images = rawImages.map((image, index) => ({
      id: emptyString(image.id, 100) || crypto.randomUUID(),
      url: cleanImageReference(image.url),
      alt: emptyString(image.alt, 250),
      kind: ['gallery', 'creative', 'screenshot'].includes(image.kind) ? image.kind : 'gallery',
      order: Number.isFinite(Number(image.order)) ? Number(image.order) : index
    })).filter(image => image.url);
    const requestedThumbnail = cleanImageReference(body.thumbnail);
    const thumbnail = images.some(image => image.url === requestedThumbnail) ? requestedThumbnail : images[0]?.url || '';
    const rawMetrics = Array.isArray(body.metrics) ? body.metrics : [];
    const metrics = rawMetrics.map((metric, index) => ({
      id: emptyString(metric.id, 100) || crypto.randomUUID(),
      label: emptyString(metric.label, 100),
      value: emptyString(metric.value, 100),
      description: emptyString(metric.description, 250),
      estimated: metric.estimated === true,
      order: Number.isFinite(Number(metric.order)) ? Number(metric.order) : index
    })).filter(metric => metric.label && metric.value);
    const id = existing?.id || crypto.randomUUID();
    const now = timestamp();
    return {
      id,
      slug: existing?.slug || slugify(title),
      title,
      categoryId,
      subcategoryId,
      businessType: emptyString(body.businessType, 100),
      description: emptyString(body.description, 2000),
      location: emptyString(body.location, 200),
      campaignDuration: emptyString(body.campaignDuration, 100),
      channels: textList(body.channels, 30),
      objectives: emptyString(body.objectives, 2000),
      audience: emptyString(body.audience, 2000),
      strategy: emptyString(body.strategy, 3000),
      resultsSummary: emptyString(body.resultsSummary, 3000),
      resultsKind: body.resultsKind || 'actual',
      status,
      featured: body.featured === true,
      thumbnail,
      images,
      metrics,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      order: existing?.order ?? store.projects.length
    };
  };

  app.get('/api/portfolio', api((req, res) => {
    const store = getStore();
    res.set('Cache-Control', 'no-store');
    const categories = orderByOrder(store.categories.filter(category => category.visible));
    const categoryIds = new Set(categories.map(category => category.id));
    const subcategories = orderByOrder(store.subcategories.filter(item => item.visible && categoryIds.has(item.categoryId)));
    const projects = orderByOrder(store.projects.map(project => publicProject(store, project)).filter(Boolean));
    res.json({ categories, subcategories, projects });
  }));

  app.get('/api/portfolio/projects/:slug', api((req, res) => {
    const store = getStore();
    const project = store.projects.find(item => item.slug === req.params.slug);
    const visible = project && publicProject(store, project);
    if (!visible) throw notFound('Published project');
    res.set('Cache-Control', 'no-store').json(visible);
  }));

  app.get('/api/portfolio/uploads/:filename', api((req, res) => {
    const filename = req.params.filename;
    const store = getStore();
    const categoryImage = store.categories.some(category => category.visible && category.image.endsWith(`/${filename}`));
    const projectImage = store.projects.some(project => publicProject(store, project) &&
      (project.thumbnail.endsWith(`/${filename}`) || project.images.some(image => image.url.endsWith(`/${filename}`))));
    if (!/^[0-9a-f-]+\.(?:png|jpg|webp|gif)$/.test(filename) || (!categoryImage && !projectImage)) throw notFound('Published image');
    res.set('Cache-Control', 'public, max-age=3600');
    res.sendFile(path.join(uploadDirectory, filename), error => {
      if (error && !res.headersSent) res.status(error.statusCode === 404 ? 404 : 500).end();
    });
  }));

  app.get('/api/admin/portfolio', auth, api((_req, res) => {
    res.set('Cache-Control', 'private, no-store').json(getStore());
  }));

  app.get('/api/admin/portfolio/uploads/:filename', auth, api((req, res) => {
    const filename = req.params.filename;
    if (!/^[0-9a-f-]+\.(?:png|jpg|webp|gif)$/.test(filename)) throw notFound('Image');
    res.set('Cache-Control', 'private, no-store');
    res.sendFile(path.join(uploadDirectory, filename), error => {
      if (error && !res.headersSent) res.status(error.statusCode === 404 ? 404 : 500).end();
    });
  }));

  app.post('/api/admin/portfolio/uploads', auth, uploadLimiter, (req, res, next) => {
    upload.array('images', 20)(req, res, error => {
      if (error) {
        if (req.files) removeTemporaryFiles(req.files);
        const tooLarge = error.code === 'LIMIT_FILE_SIZE';
        return res.status(400).json({ error: tooLarge ? 'Each image must be 8 MB or smaller.' : error.message });
      }
      next();
    });
  }, api((req, res) => {
    const kind = ['gallery', 'creative', 'screenshot'].includes(req.body.kind) ? req.body.kind : 'gallery';
    const files = req.files || [];
    if (files.reduce((total, file) => total + file.size, 0) > 32 * 1024 * 1024) {
      removeTemporaryFiles(files);
      return res.status(400).json({ error: 'The total size of one upload must be 32 MB or smaller.' });
    }
    const saved = [];
    for (const file of files) {
      const bytes = fs.readFileSync(file.path);
      const definition = imageTypes.get(file.mimetype);
      if (!definition?.matches(bytes)) {
        removeTemporaryFiles(files);
        for (const item of saved) fs.rmSync(item.path, { force: true });
        throw Object.assign(new Error('The image file contents do not match a supported image format.'), { status: 400 });
      }
      const filename = `${path.basename(file.filename, '.tmp')}.${definition.extension}`;
      const destination = path.join(uploadDirectory, filename);
      fs.renameSync(file.path, destination);
      saved.push({ path: destination, filename });
    }
    res.status(201).json({
      images: saved.map((file, index) => ({
        id: crypto.randomUUID(),
        url: `/api/portfolio/uploads/${file.filename}`,
        alt: '',
        kind,
        order: index
      }))
    });
  }));

  app.post('/api/admin/portfolio/categories', auth, api((req, res) => {
    const store = getStore();
    const category = normalizeCategory(req.body, null, store);
    store.categories.push(category);
    save(store);
    res.status(201).json(category);
  }));

  app.put('/api/admin/portfolio/categories/:id', auth, api((req, res) => {
    const store = getStore();
    const index = store.categories.findIndex(item => item.id === req.params.id);
    if (index < 0) throw notFound('Category');
    store.categories[index] = normalizeCategory(req.body, store.categories[index], store);
    save(store);
    res.json(store.categories[index]);
  }));

  app.delete('/api/admin/portfolio/categories/:id', auth, api((req, res) => {
    const store = getStore();
    if (!byId(store.categories, req.params.id)) throw notFound('Category');
    if (store.subcategories.some(item => item.categoryId === req.params.id) || store.projects.some(item => item.categoryId === req.params.id)) {
      throw Object.assign(new Error('Move or remove this category’s subcategories and projects before deleting it.'), { status: 409 });
    }
    store.categories = store.categories.filter(item => item.id !== req.params.id);
    save(store);
    res.json({ ok: true });
  }));

  app.post('/api/admin/portfolio/subcategories', auth, api((req, res) => {
    const store = getStore();
    const subcategory = normalizeSubcategory(req.body, null, store);
    store.subcategories.push(subcategory);
    save(store);
    res.status(201).json(subcategory);
  }));

  app.put('/api/admin/portfolio/subcategories/:id', auth, api((req, res) => {
    const store = getStore();
    const index = store.subcategories.findIndex(item => item.id === req.params.id);
    if (index < 0) throw notFound('Subcategory');
    store.subcategories[index] = normalizeSubcategory(req.body, store.subcategories[index], store);
    save(store);
    res.json(store.subcategories[index]);
  }));

  app.delete('/api/admin/portfolio/subcategories/:id', auth, api((req, res) => {
    const store = getStore();
    if (!byId(store.subcategories, req.params.id)) throw notFound('Subcategory');
    if (store.projects.some(item => item.subcategoryId === req.params.id)) {
      throw Object.assign(new Error('Move or remove this subcategory’s projects before deleting it.'), { status: 409 });
    }
    store.subcategories = store.subcategories.filter(item => item.id !== req.params.id);
    save(store);
    res.json({ ok: true });
  }));

  app.post('/api/admin/portfolio/projects', auth, api((req, res) => {
    const store = getStore();
    const project = normalizeProject(req.body, null, store);
    if (store.projects.some(item => item.slug === project.slug)) {
      project.slug = `${project.slug}-${crypto.randomUUID().slice(0, 8)}`;
    }
    store.projects.push(project);
    save(store);
    res.status(201).json(project);
  }));

  app.put('/api/admin/portfolio/projects/:id', auth, api((req, res) => {
    const store = getStore();
    const index = store.projects.findIndex(item => item.id === req.params.id);
    if (index < 0) throw notFound('Project');
    const project = normalizeProject(req.body, store.projects[index], store);
    if (store.projects.some(item => item.id !== project.id && item.slug === project.slug)) {
      throw Object.assign(new Error('Another project already uses this case-study URL.'), { status: 409 });
    }
    store.projects[index] = project;
    save(store);
    res.json(project);
  }));

  app.post('/api/admin/portfolio/projects/:id/duplicate', auth, api((req, res) => {
    const store = getStore();
    const original = byId(store.projects, req.params.id);
    if (!original) throw notFound('Project');
    const copy = {
      ...original,
      id: crypto.randomUUID(),
      slug: `${original.slug}-copy-${crypto.randomUUID().slice(0, 8)}`,
      title: `${original.title} (copy)`,
      status: 'draft',
      featured: false,
      images: original.images.map(image => ({ ...image, id: crypto.randomUUID() })),
      metrics: original.metrics.map(metric => ({ ...metric, id: crypto.randomUUID() })),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      order: store.projects.length
    };
    store.projects.push(copy);
    save(store);
    res.status(201).json(copy);
  }));

  app.delete('/api/admin/portfolio/projects/:id', auth, api((req, res) => {
    const store = getStore();
    if (!byId(store.projects, req.params.id)) throw notFound('Project');
    store.projects = store.projects.filter(item => item.id !== req.params.id);
    save(store);
    res.json({ ok: true });
  }));

  app.patch('/api/admin/portfolio/reorder', auth, api((req, res) => {
    const store = getStore();
    const { type, ids } = req.body;
    if (!['categories', 'subcategories', 'projects'].includes(type) || !Array.isArray(ids) || new Set(ids).size !== ids.length) {
      throw Object.assign(new Error('Choose a valid list order.'), { status: 400 });
    }
    const items = store[type];
    if (ids.some(id => !items.some(item => item.id === id))) {
      throw Object.assign(new Error('The list order contains an unknown item.'), { status: 400 });
    }
    ids.forEach((id, index) => { byId(items, id).order = index; });
    save(store);
    res.json({ ok: true });
  }));
}

module.exports = { attachPortfolioRoutes };
