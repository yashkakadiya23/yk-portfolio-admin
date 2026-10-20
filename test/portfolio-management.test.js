const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const authToken = 'portfolio-management-test-token';

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test('portfolio management is authenticated, persistent, publish-aware, and validates image uploads', async t => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'yk-portfolio-management-'));
  const portfolioFile = path.join(temporaryDirectory, 'portfolio.json');
  const uploadDirectory = path.join(temporaryDirectory, 'uploads');
  fs.copyFileSync(path.join(root, 'data', 'portfolio-seed.json'), portfolioFile);
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const environment = {
    ...process.env,
    PORT: String(port),
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'Portfolio-Test-Password-123!',
    ADMIN_TOKEN: authToken,
    PORTFOLIO_DATA_FILE: portfolioFile,
    PORTFOLIO_UPLOAD_DIRECTORY: uploadDirectory
  };
  let child;
  let childOutput = '';

  function startServer() {
    child = spawn(process.execPath, ['server.js'], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { childOutput += chunk; });
    child.stderr.on('data', chunk => { childOutput += chunk; });
  }

  async function waitForServer() {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited early:\n${childOutput}`);
      try {
        if ((await fetch(`${baseUrl}/api/health`)).ok) return;
      } catch {}
      await sleep(50);
    }
    throw new Error(`Server did not start:\n${childOutput}`);
  }

  async function stopServer() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await Promise.race([exited, sleep(3000)]);
    child = null;
  }

  async function authorized(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${authToken}`);
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    return fetch(`${baseUrl}${url}`, { ...options, headers });
  }

  async function json(response) {
    return response.json();
  }

  t.after(async () => {
    await stopServer();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  const original = JSON.parse(fs.readFileSync(portfolioFile, 'utf8'));
  assert.equal(original.categories.length, 6);
  assert.equal(original.projects[0].metrics.length, 13);
  assert.equal(original.projects[0].images[0].url, '/images/health-wellness-meta-ads.png');

  startServer();
  await waitForServer();

  assert.equal((await fetch(`${baseUrl}/api/admin/portfolio`)).status, 401);
  const unauthorizedUpload = new FormData();
  unauthorizedUpload.append('images', new Blob(['no'], { type: 'image/png' }), 'image.png');
  assert.equal((await fetch(`${baseUrl}/api/admin/portfolio/uploads`, { method: 'POST', body: unauthorizedUpload })).status, 401);

  const dataResponse = await authorized('/api/admin/portfolio');
  assert.equal(dataResponse.status, 200);
  const data = await json(dataResponse);
  assert.equal(data.projects[0].title, original.projects[0].title);

  const categoryResponse = await authorized('/api/admin/portfolio/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Portfolio Test Category', description: 'Test category', icon: '✦', number: '07', color: '#123abc', visible: true })
  });
  assert.equal(categoryResponse.status, 201);
  const category = await json(categoryResponse);

  const subcategoryResponse = await authorized('/api/admin/portfolio/subcategories', {
    method: 'POST',
    body: JSON.stringify({ categoryId: category.id, name: 'Test Services', description: 'Test subcategory', visible: true })
  });
  assert.equal(subcategoryResponse.status, 201);
  const subcategory = await json(subcategoryResponse);

  const invalidUpload = new FormData();
  invalidUpload.append('kind', 'screenshot');
  invalidUpload.append('images', new Blob(['not an image'], { type: 'text/plain' }), 'not-image.txt');
  assert.equal((await authorized('/api/admin/portfolio/uploads', { method: 'POST', body: invalidUpload })).status, 400);

  const spoofedUpload = new FormData();
  spoofedUpload.append('images', new Blob(['not actually png'], { type: 'image/png' }), 'spoofed.png');
  assert.equal((await authorized('/api/admin/portfolio/uploads', { method: 'POST', body: spoofedUpload })).status, 400);

  const oversizedUpload = new FormData();
  oversizedUpload.append('images', new Blob([Buffer.alloc(8 * 1024 * 1024 + 1)], { type: 'image/png' }), 'too-large.png');
  assert.equal((await authorized('/api/admin/portfolio/uploads', { method: 'POST', body: oversizedUpload })).status, 400);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n4sAAAAASUVORK5CYII=', 'base64');
  const uploadForm = new FormData();
  uploadForm.append('kind', 'screenshot');
  uploadForm.append('images', new Blob([png], { type: 'image/png' }), 'campaign.png');
  const uploadResponse = await authorized('/api/admin/portfolio/uploads', { method: 'POST', body: uploadForm });
  assert.equal(uploadResponse.status, 201);
  const [image] = (await json(uploadResponse)).images;

  const projectPayload = {
    title: 'Portfolio API Test Study',
    categoryId: category.id,
    subcategoryId: subcategory.id,
    businessType: 'B2C',
    description: 'A test campaign with a persistent case study.',
    location: 'Surat, India',
    campaignDuration: '3 months',
    channels: ['Meta Ads'],
    objectives: 'Test lead generation',
    audience: 'Local customers',
    strategy: 'A test strategy.',
    resultsSummary: 'An actual test result.',
    resultsKind: 'actual',
    status: 'draft',
    featured: true,
    thumbnail: image.url,
    images: [image],
    metrics: [{ label: 'Leads', value: '42', description: 'Test leads', estimated: false, order: 0 }]
  };
  const projectResponse = await authorized('/api/admin/portfolio/projects', {
    method: 'POST',
    body: JSON.stringify(projectPayload)
  });
  assert.equal(projectResponse.status, 201);
  let project = await json(projectResponse);
  assert.equal((await fetch(`${baseUrl}/api/portfolio/projects/${project.slug}`)).status, 404);
  assert.equal((await fetch(`${baseUrl}${image.url}`)).status, 404);

  const blockedCategoryDelete = await authorized(`/api/admin/portfolio/categories/${category.id}`, { method: 'DELETE' });
  assert.equal(blockedCategoryDelete.status, 409);

  project.status = 'published';
  const publishResponse = await authorized(`/api/admin/portfolio/projects/${project.id}`, {
    method: 'PUT',
    body: JSON.stringify(project)
  });
  assert.equal(publishResponse.status, 200);
  project = await json(publishResponse);
  assert.equal((await fetch(`${baseUrl}/api/portfolio/projects/${project.slug}`)).status, 200);
  assert.equal((await fetch(`${baseUrl}${image.url}`)).status, 200);
  assert.equal((await authorized(`/api/admin/portfolio/uploads/${image.url.split('/').pop()}`)).status, 200);

  project.title = 'Edited Portfolio API Test Study';
  project.description = 'The edited description survives a server restart.';
  project.metrics.push({ label: 'Appointments', value: '8', description: '', estimated: true, order: 1 });
  const editResponse = await authorized(`/api/admin/portfolio/projects/${project.id}`, {
    method: 'PUT',
    body: JSON.stringify(project)
  });
  assert.equal(editResponse.status, 200);
  project = await json(editResponse);
  assert.equal(project.metrics.length, 2);
  assert.equal(project.metrics[1].estimated, true);

  await stopServer();
  startServer();
  await waitForServer();
  const persisted = await json(await fetch(`${baseUrl}/api/portfolio/projects/${project.slug}`));
  assert.equal(persisted.title, 'Edited Portfolio API Test Study');
  assert.equal(persisted.description, 'The edited description survives a server restart.');
  assert.equal(persisted.metrics.length, 2);

  persisted.status = 'draft';
  assert.equal((await authorized(`/api/admin/portfolio/projects/${project.id}`, {
    method: 'PUT',
    body: JSON.stringify(persisted)
  })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/portfolio/projects/${project.slug}`)).status, 404);

  assert.equal((await authorized(`/api/admin/portfolio/projects/${project.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await authorized(`/api/admin/portfolio/subcategories/${subcategory.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await authorized(`/api/admin/portfolio/categories/${category.id}`, { method: 'DELETE' })).status, 200);
});
