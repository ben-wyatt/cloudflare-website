let indexPromise;

function getIndex(env, requestUrl) {
  indexPromise ||= env.ASSETS.fetch(new URL('/assets/search-index.json', requestUrl))
    .then(response => {
      if (!response.ok) throw new Error('Search index unavailable');
      return response.json();
    }).catch(error => {
      indexPromise = null;
      throw error;
    });
  return indexPromise;
}

function normalized(values) {
  const length = Math.hypot(...values) || 1;
  return values.map(value => value / length);
}

function lexicalScore(passage, query) {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const title = passage.title.toLowerCase();
  const heading = passage.heading.toLowerCase();
  const text = passage.text.toLowerCase();
  if (!terms.length || !terms.every(term =>
    title.includes(term) || heading.includes(term) || text.includes(term)
  )) return 0;
  return 0.15 + (title.includes(query) ? 0.4 : 0) +
    (heading.includes(query) ? 0.25 : 0) + (text.includes(query) ? 0.15 : 0);
}

function rank(index, query, queryVector) {
  const bestByPost = new Map();
  for (const passage of index.passages) {
    const lexical = lexicalScore(passage, query);
    const semantic = passage.vector.reduce(
      (sum, value, i) => sum + value * queryVector[i], 0
    );
    if (!lexical && semantic < 0.55) continue;
    const score = lexical + semantic;
    const previous = bestByPost.get(passage.slug);
    if (!previous || score > previous.score) {
      bestByPost.set(passage.slug, { passage, score });
    }
  }
  return [...bestByPost.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ passage }) => ({
      slug: passage.slug,
      title: passage.title,
      heading: passage.heading,
      url: passage.url,
      excerpt: passage.excerpt,
    }));
}

export async function onRequestPost({ request, env }) {
  if (Number(request.headers.get('content-length')) > 1024) {
    return Response.json({ error: 'query_too_long' }, { status: 413 });
  }
  let query;
  try {
    ({ query } = await request.json());
  } catch (_) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 200) {
    return Response.json({ error: 'invalid_query' }, { status: 400 });
  }
  if (!env.AI) {
    return Response.json({ error: 'search_unavailable' }, { status: 503 });
  }

  try {
    const index = await getIndex(env, request.url);
    if (!index.passages.length) return Response.json({ results: [] });
    const answer = await env.AI.run(index.model, {
      text: [`Represent this sentence for searching relevant passages: ${query.trim()}`],
      pooling: index.pooling,
    });
    const values = answer.data?.[0];
    if (!Array.isArray(values) || values.length !== index.passages[0].vector.length) {
      throw new Error('Unexpected embedding response');
    }
    return Response.json({ results: rank(index, query.trim().toLowerCase(), normalized(values)) }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error('Blog search failed:', error);
    return Response.json({ error: 'search_unavailable' }, { status: 503 });
  }
}
