const form = document.getElementById('blog-search');
const input = document.getElementById('blog-search-query');
const results = document.getElementById('blog-search-results');
const status = document.getElementById('blog-search-status');
const list = document.getElementById('blog-search-list');

let documentsPromise;
let activeRequest;
let searchVersion = 0;

function getDocuments() {
  documentsPromise ||= fetch('/assets/search-documents.json').then(response => {
    if (!response.ok) throw new Error('Search documents unavailable');
    return response.json();
  }).catch(error => {
    documentsPromise = null;
    throw error;
  });
  return documentsPromise;
}

function keywordMatches(passages, query) {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const bestByPost = new Map();
  for (const passage of passages) {
    const title = passage.title.toLowerCase();
    const heading = passage.heading.toLowerCase();
    const text = passage.text.toLowerCase();
    if (!terms.length || !terms.every(term =>
      title.includes(term) || heading.includes(term) || text.includes(term)
    )) continue;
    const score = (title.includes(query) ? 4 : 0) +
      (heading.includes(query) ? 2 : 0) + (text.includes(query) ? 1 : 0);
    const previous = bestByPost.get(passage.slug);
    if (!previous || score > previous.score) bestByPost.set(passage.slug, { passage, score });
  }
  return [...bestByPost.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ passage }) => passage);
}

function render(matches, message) {
  results.hidden = false;
  status.textContent = message;
  list.replaceChildren();
  for (const passage of matches) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = passage.url;
    link.textContent = passage.title;
    item.append(link);
    if (passage.heading) {
      const context = document.createElement('p');
      context.className = 'blog-search-context';
      context.textContent = passage.heading;
      item.append(context);
    }
    const excerpt = document.createElement('p');
    excerpt.textContent = passage.excerpt;
    item.append(excerpt);
    list.append(item);
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const query = input.value.trim().slice(0, 200);
  if (!query) return;
  const currentSearch = ++searchVersion;
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 8000);
  const serverResult = fetch('/api/blog/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: controller.signal,
  }).then(async response => {
    if (!response.ok) throw new Error('Semantic search unavailable');
    return response.json();
  }).then(data => ({ data }), error => ({ error }));

  render([], 'Searching…');
  let localMatches = [];
  try {
    const documents = await getDocuments();
    if (currentSearch !== searchVersion) return;
    localMatches = keywordMatches(documents.passages, query);
    render(localMatches, 'Checking meaning…');
  } catch (_) {
    if (currentSearch !== searchVersion) return;
  }

  const result = await serverResult;
  clearTimeout(timeout);
  if (currentSearch !== searchVersion) return;
  if (result.data) {
    const matches = result.data.results;
    render(matches, matches.length
      ? `${matches.length} matching post${matches.length === 1 ? '' : 's'}`
      : 'No matching posts.');
  } else {
    render(localMatches, localMatches.length
      ? `${localMatches.length} keyword match${localMatches.length === 1 ? '' : 'es'}; semantic search is unavailable.`
      : 'No keyword matches; semantic search is unavailable.');
  }
});
