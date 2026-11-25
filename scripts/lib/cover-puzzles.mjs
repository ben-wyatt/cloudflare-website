// Pure helpers for the cover-similarity script: neighbors, look-alike pairs and
// four-by-four puzzles from cosine similarities. Vectors must be L2-normalized.

export function dot(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += left[index] * right[index];
  return sum;
}

// ids: string[]; vectors: Float32Array[] in the same order. Returns sim(i, j) by index.
export function similarityMatrix(vectors) {
  const size = vectors.length;
  const matrix = Array.from({ length: size }, () => new Float64Array(size));
  for (let i = 0; i < size; i += 1) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < size; j += 1) {
      const value = dot(vectors[i], vectors[j]);
      matrix[i][j] = value;
      matrix[j][i] = value;
    }
  }
  return matrix;
}

// Each index's `count` most similar other indexes, most similar first.
export function nearest(matrix, index, count, allowed = null) {
  const scores = [];
  for (let other = 0; other < matrix.length; other += 1) {
    if (other === index || (allowed && !allowed.has(other))) continue;
    scores.push([other, matrix[index][other]]);
  }
  return scores.sort((a, b) => b[1] - a[1]).slice(0, count);
}

// The most alike pairs where the two records were picked by different people.
// pickers: Map(index -> Set of user ids). Each record appears in at most one pair.
export function lookAlikePairs(matrix, indexes, pickers, count) {
  const pairs = [];
  for (let a = 0; a < indexes.length; a += 1) {
    for (let b = a + 1; b < indexes.length; b += 1) {
      const i = indexes[a];
      const j = indexes[b];
      const left = pickers.get(i) || new Set();
      const right = pickers.get(j) || new Set();
      const samePeople = left.size === right.size && [...left].every((id) => right.has(id));
      if (samePeople) continue;
      pairs.push({ i, j, similarity: matrix[i][j] });
    }
  }
  pairs.sort((a, b) => b.similarity - a.similarity);
  const used = new Set();
  const chosen = [];
  for (const pair of pairs) {
    if (used.has(pair.i) || used.has(pair.j)) continue;
    used.add(pair.i);
    used.add(pair.j);
    chosen.push(pair);
    if (chosen.length >= count) break;
  }
  return chosen;
}

const meanSimilarity = (matrix, index, group) => {
  const others = group.filter((other) => other !== index);
  return others.reduce((sum, other) => sum + matrix[index][other], 0) / (others.length || 1);
};

export function tightness(matrix, group) {
  let sum = 0;
  let pairs = 0;
  for (let a = 0; a < group.length; a += 1) {
    for (let b = a + 1; b < group.length; b += 1) {
      sum += matrix[group[a]][group[b]];
      pairs += 1;
    }
  }
  return pairs ? sum / pairs : 0;
}

// How clearly each cover belongs to its own group: its mean similarity to its own group
// minus its highest mean similarity to another group. The puzzle's margin is the worst one.
export function puzzleMargin(matrix, groups) {
  let worst = Infinity;
  for (let g = 0; g < groups.length; g += 1) {
    for (const index of groups[g]) {
      const own = meanSimilarity(matrix, index, groups[g]);
      let other = -Infinity;
      for (let h = 0; h < groups.length; h += 1) {
        if (h !== g) other = Math.max(other, meanSimilarity(matrix, index, [...groups[h], index]));
      }
      worst = Math.min(worst, own - other);
    }
  }
  return worst;
}

// A small seeded random number generator, so a run can be repeated.
export function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Candidate groups of four: each cover with three of its six nearest neighbors.
export function candidateQuads(matrix, indexes, { neighbors = 6 } = {}) {
  const allowed = new Set(indexes);
  const seen = new Map();
  for (const index of indexes) {
    const near = nearest(matrix, index, neighbors, allowed).map(([other]) => other);
    for (let a = 0; a < near.length; a += 1) {
      for (let b = a + 1; b < near.length; b += 1) {
        for (let c = b + 1; c < near.length; c += 1) {
          const quad = [index, near[a], near[b], near[c]].sort((x, y) => x - y);
          const key = quad.join(",");
          if (!seen.has(key)) seen.set(key, { quad, tightness: tightness(matrix, quad) });
        }
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.tightness - a.tightness);
}

// Average-linkage clustering: start with every cover alone and keep merging the two
// clusters with the highest mean similarity until `count` clusters remain.
export function clusterIndexes(matrix, indexes, count) {
  let clusters = indexes.map((index) => [index]);
  const link = (a, b) => {
    let sum = 0;
    for (const i of a) for (const j of b) sum += matrix[i][j];
    return sum / (a.length * b.length);
  };
  while (clusters.length > count) {
    let best = [-1, -1, -Infinity];
    for (let a = 0; a < clusters.length; a += 1) {
      for (let b = a + 1; b < clusters.length; b += 1) {
        const value = link(clusters[a], clusters[b]);
        if (value > best[2]) best = [a, b, value];
      }
    }
    const [a, b] = best;
    clusters[a] = [...clusters[a], ...clusters[b]];
    clusters.splice(b, 1);
  }
  return clusters.sort((x, y) => y.length - x.length);
}

// A cluster's best groups of four: its tightest quads, at most `limit`, varied in members.
function clusterQuads(matrix, cluster, limit = 4) {
  const quads = candidateQuads(matrix, cluster, { neighbors: Math.min(6, cluster.length - 1) });
  const chosen = [];
  for (const candidate of quads) {
    // Each further quad must swap at least two covers from every quad already kept.
    if (chosen.some((kept) => kept.quad.filter((index) => candidate.quad.includes(index)).length > 2)) continue;
    chosen.push(candidate);
    if (chosen.length >= limit) break;
  }
  return chosen.map((candidate) => candidate.quad);
}

// Puzzles of four groups of four. The covers are first sorted into look-alike clusters, and
// each puzzle takes one tight quad from each of four different clusters, so puzzles vary.
// The groups must be clearly apart (puzzleMargin >= minMargin); a cover is used in at most
// `maxUses` puzzles, and the same four clusters never make two puzzles.
export function makePuzzles(matrix, indexes, {
  count = 12, attempts = 8000, minMargin = 0.015, maxUses = 3, seed = 7, clusters: clusterCount,
} = {}) {
  const random = seededRandom(seed);
  // Average linkage chains a few big clusters; split any big one again into bins of about eight.
  const clusters = clusterIndexes(matrix, indexes, clusterCount || Math.max(8, Math.round(indexes.length / 5)))
    .flatMap((cluster) => (cluster.length > 12 ? clusterIndexes(matrix, cluster, Math.ceil(cluster.length / 8)) : [cluster]))
    .filter((cluster) => cluster.length >= 4);
  const options = clusters.map((cluster) => clusterQuads(matrix, cluster)).filter((quads) => quads.length);
  if (options.length < 4) return [];
  const found = [];
  const seen = new Set();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const picked = [...options.keys()].sort(() => random() - 0.5).slice(0, 4).sort((a, b) => a - b);
    const key = picked.join(",");
    const groups = picked.map((option) => options[option][Math.floor(random() * options[option].length)]);
    const margin = puzzleMargin(matrix, groups);
    if (margin < minMargin) continue;
    const fullKey = `${key}|${groups.map((group) => group.join(",")).join("|")}`;
    if (seen.has(fullKey)) continue;
    seen.add(fullKey);
    found.push({ key, groups, margin,
      tightness: groups.reduce((sum, group) => sum + tightness(matrix, group), 0) / 4 });
  }
  found.sort((a, b) => (b.margin + b.tightness) - (a.margin + a.tightness));
  const uses = new Map();
  const usedKeys = new Set();
  const chosen = [];
  for (const puzzle of found) {
    const covers = puzzle.groups.flat();
    if (usedKeys.has(puzzle.key)) continue;
    if (covers.some((index) => (uses.get(index) || 0) >= maxUses)) continue;
    // Two puzzles may share at most one group of four, so no puzzle feels like a repeat.
    const quadKeys = puzzle.groups.map((group) => [...group].sort((a, b) => a - b).join(","));
    if (chosen.some((other) => other.quadKeys.filter((key) => quadKeys.includes(key)).length > 1)) continue;
    puzzle.quadKeys = quadKeys;
    covers.forEach((index) => uses.set(index, (uses.get(index) || 0) + 1));
    usedKeys.add(puzzle.key);
    // Easiest (tightest) group first.
    puzzle.groups.sort((a, b) => tightness(matrix, b) - tightness(matrix, a));
    chosen.push(puzzle);
    if (chosen.length >= count) break;
  }
  return chosen;
}
