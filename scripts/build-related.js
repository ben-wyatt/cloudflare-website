// Incremental semantic related-posts and blog-search builder
// - Caches per-post embeddings by content hash
// - Caches per-passage search embeddings by content hash
// - Writes related links and server/keyword search indexes

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
const SEARCH_FILE = path.join(ROOT, 'assets', 'search-index.json');
const DOCUMENTS_FILE = path.join(ROOT, 'assets', 'search-documents.json');
const RELATED_MODEL = 'Xenova/all-MiniLM-L6-v2';
const SEARCH_MODEL = 'Xenova/bge-small-en-v1.5';
const SEARCH_RUNTIME_MODEL = '@cf/baai/bge-small-en-v1.5';

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

async function loadEmbedder(model) {
  const { pipeline } = await import('@xenova/transformers');
  return pipeline('feature-extraction', model);
}

function headingSlug(text) {
  return text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

function plainText(md) {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchPassages(post) {
  const body = stripCodeBlocks(post.body).replace(/\r\n/g, '\n');
  const sections = [];
  let section = { heading: '', anchor: '', paragraphs: [] };
  for (const block of body.split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const heading = trimmed.match(/^#{2,6}\s+(.+?)(?:\n|$)/);
    if (heading) {
      if (section.paragraphs.length) sections.push(section);
      const label = plainText(heading[1]);
      section = { heading: label, anchor: headingSlug(label), paragraphs: [] };
      const rest = trimmed.slice(heading[0].length).trim();
      if (rest) section.paragraphs.push(rest);
    } else {
      section.paragraphs.push(trimmed);
    }
  }
  if (section.paragraphs.length) sections.push(section);

  const passages = [];
  for (const part of sections) {
    const words = plainText(part.paragraphs.join(' ')).split(/\s+/).filter(Boolean);
    // Keep each input safely below the model's token limit and retain section links.
    for (let start = 0; start < words.length; start += 90) {
      const text = words.slice(start, start + 110).join(' ');
      if (!text) continue;
      const id = `${post.slug}:${passages.length}`;
      passages.push({
        id,
        slug: post.slug,
        title: post.title,
        heading: part.heading,
        url: `/posts/${post.slug}/${part.anchor ? `#${part.anchor}` : ''}`,
        excerpt: text.length > 260 ? `${text.slice(0, 257).trimEnd()}…` : text,
        text: `${post.title}. ${part.heading ? `${part.heading}. ` : ''}${text}`,
      });
    }
  }
  return passages;
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
    await fsp.writeFile(SEARCH_FILE, JSON.stringify({ model: SEARCH_RUNTIME_MODEL, pooling: 'mean', passages: [] }));
    await fsp.writeFile(DOCUMENTS_FILE, JSON.stringify({ passages: [] }));
    console.log('No posts found; wrote empty related.json');
    return;
  }

  const cache = await readCache();
  cache.embeddings = cache.embeddings || {};
  cache.searchPassages = cache.searchPassages || {};

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
    fe = await loadEmbedder(RELATED_MODEL);
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

  const passages = posts.flatMap(searchPassages);
  const documents = passages.map(({ id, slug, title, heading, url, excerpt, text }) => ({
    id, slug, title, heading, url, excerpt, text,
  }));
  await fsp.writeFile(DOCUMENTS_FILE, JSON.stringify({ passages: documents }));
  if (cache.searchModel !== SEARCH_MODEL) {
    cache.searchPassages = {};
    cache.searchModel = SEARCH_MODEL;
  }
  const activeIds = new Set(passages.map(p => p.id));
  let removed = 0;
  for (const id of Object.keys(cache.searchPassages)) {
    if (!activeIds.has(id)) {
      delete cache.searchPassages[id];
      removed++;
    }
  }
  const changed = passages.filter(p => {
    const saved = cache.searchPassages[p.id];
    return !saved || saved.hash !== sha256Hex(p.text) || !Array.isArray(saved.vector);
  });
  if (changed.length) {
    console.log(`Embedding ${changed.length} search passage(s) of ${passages.length} total...`);
    const searchEmbedder = await loadEmbedder(SEARCH_MODEL);
    for (const passage of changed) {
      const output = await searchEmbedder(passage.text, { pooling: 'mean', normalize: true });
      cache.searchPassages[passage.id] = {
        hash: sha256Hex(passage.text),
        vector: Array.from(output.data),
      };
    }
  }
  if (changed.length || removed) await writeCache(cache);
  const index = {
    model: SEARCH_RUNTIME_MODEL,
    pooling: 'mean',
    passages: passages.map(passage => ({
      ...passage,
      vector: cache.searchPassages[passage.id].vector,
    })),
  };
  await fsp.writeFile(SEARCH_FILE, JSON.stringify(index));
  console.log(`Wrote ${SEARCH_FILE} with ${passages.length} passages.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
