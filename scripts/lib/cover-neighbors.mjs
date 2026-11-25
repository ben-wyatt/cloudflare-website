// Pure helpers for the cover-similarity script: similarities, nearest covers and the most
// alike pairs, from L2-normalized embedding vectors.

export function dot(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += left[index] * right[index];
  return sum;
}

// Returns sim(i, j) by index, for vectors in a fixed order.
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
