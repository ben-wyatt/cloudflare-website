// Incremental semantic related-posts builder
// - Caches per-post embeddings by content hash
// - Re-embeds only changed posts
// - Computes pairwise cosine similarities and writes src/_data/related.json

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const matter = require('gray-matter');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'src', 'posts');
const DATA_DIR = path.join(ROOT, 'src', '_data');
const CACHE_DIR = path.join(ROOT, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'embeddings.json');
const OUT_FILE = path.join(DATA_DIR, 'related.json');

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function toSlug(filename) {
  return path.basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function stripCodeBlocks(md) {
  return md.replace(/```[\s\S]*?```/g, '');
}

function chunkText(content, chunkSize = 1500, overlap = 200) {
  const text = content || '';
  if (text.length <= chunkSize) return [text];
  const chunks = [];
  let index = 0;
  while (index < text.length) {
    const end = Math.min(text.length, index + chunkSize);
    chunks.push(text.slice(index, end));
    if (end === text.length) break;
    index += chunkSize - overlap;
  }
  return chunks;
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) dot += vecA[i] * vecB[i];
  return dot; // both are normalized
}

async function loadEmbedder() {
  const { pipeline } = await import('@xenova/transformers');
  // Small, fast model; good quality for blog posts
  return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
}

async function embedDocument(featureExtraction, title, body) {
  const clean = stripCodeBlocks(`${title}\n\n${body}`).trim();
  if (!clean) return [];
  const chunks = chunkText(clean, 1500, 200);
  let sum = null;
  for (const chunk of chunks) {
    const output = await featureExtraction(chunk, { pooling: 'mean', normalize: true });
    const vec = Array.from(output.data);
    if (sum == null) sum = vec;
    else for (let i = 0; i < vec.length; i++) sum[i] += vec[i];
  }
  const avg = sum.map(v => v / chunks.length);
  // Normalize the averaged vector
  const norm = Math.sqrt(avg.reduce((acc, v) => acc + v * v, 0)) || 1;
  return avg.map(v => v / norm);
}

async function readPosts() {
  const entries = await fsp.readdir(POSTS_DIR, { withFileTypes: true });
  const files = entries
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => path.join(POSTS_DIR, e.name));
  const posts = [];
  for (const file of files) {
    const raw = await fsp.readFile(file, 'utf8');
    const fm = matter(raw);
    const slug = toSlug(file);
    const title = fm.data.title || slug.replace(/-/g, ' ');
    const body = fm.content || '';
    const hash = sha256Hex(raw);
    posts.push({ slug, title, body, hash, file });
  }
  return posts;
}

async function readCache() {
  try {
    const raw = await fsp.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return { embeddings: {} };
  }
}

async function writeCache(cache) {
  ensureDirSync(CACHE_DIR);
  await fsp.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function writeRelated(related) {
  ensureDirSync(DATA_DIR);
  await fsp.writeFile(OUT_FILE, JSON.stringify(related, null, 2));
}

async function main() {
  ensureDirSync(DATA_DIR);
  ensureDirSync(CACHE_DIR);

  const posts = await readPosts();
  if (posts.length === 0) {
    await writeRelated({});
    console.log('No posts found; wrote empty related.json');
    return;
  }

  const cache = await readCache();
  cache.embeddings = cache.embeddings || {};

  // Determine which posts need re-embedding
  const toEmbed = [];
  for (const p of posts) {
    const cached = cache.embeddings[p.slug];
    if (!cached || cached.hash !== p.hash || !Array.isArray(cached.vector)) {
      toEmbed.push(p);
    }
  }

  let fe = null;
  if (toEmbed.length) {
    console.log(`Embedding ${toEmbed.length} changed/new post(s) of ${posts.length} total...`);
    fe = await loadEmbedder();
    for (const p of toEmbed) {
      const vector = await embedDocument(fe, p.title, p.body);
      cache.embeddings[p.slug] = { hash: p.hash, vector };
    }
    await writeCache(cache);
  } else {
    console.log('No content changes detected; using cached embeddings.');
  }

  // Build vector matrix in consistent order
  const slugs = posts.map(p => p.slug);
  const vectors = slugs.map(slug => (cache.embeddings[slug] && cache.embeddings[slug].vector) || []);

  // Compute pairwise similarities (normalized vectors -> cosine == dot)
  const related = {};
  for (let i = 0; i < slugs.length; i++) {
    const sims = [];
    const vi = vectors[i];
    if (!vi || vi.length === 0) {
      related[slugs[i]] = [];
      continue;
    }
    for (let j = 0; j < slugs.length; j++) {
      if (i === j) continue;
      const vj = vectors[j];
      if (!vj || vj.length === 0) continue;
      const score = cosineSimilarity(vi, vj);
      sims.push({ slug: slugs[j], score });
    }
    sims.sort((a, b) => b.score - a.score);
    // keep top-K most similar; always show up to 5 (excluding self)
    const TOP_K = 5;
    related[slugs[i]] = sims.slice(0, TOP_K);
  }

  await writeRelated(related);
  console.log(`Wrote ${OUT_FILE} with related links for ${slugs.length} posts.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


