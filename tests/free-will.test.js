const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SequencePredictor,
  chartCoordinates,
  createSeededRandom,
  replaySequence,
} = require("../assets/js/free-will.js");

test("warms up for five presses before scoring predictions", () => {
  const predictor = new SequencePredictor({ random: () => 0.25 });

  for (const key of "dfdfd") {
    const result = predictor.record(key);
    assert.equal(result.prediction, null);
  }

  const firstGuess = predictor.record("f");
  assert.equal(firstGuess.prediction, "f");
  assert.equal(firstGuess.wasCorrect, true);
  assert.equal(firstGuess.predictions, 1);
});

test("learns simple repetition and alternation", () => {
  for (const sequence of ["d".repeat(80), "df".repeat(40)]) {
    const predictor = new SequencePredictor({ random: () => 0.25 });
    for (const key of sequence) predictor.record(key);

    assert.ok(predictor.predictions > 70);
    assert.ok(predictor.correct / predictor.predictions > 0.95);
  }
});

test("supports pattern memories from three through fifteen keys", () => {
  const shortPredictor = new SequencePredictor({ maxOrder: 3, random: () => 0.25 });
  const longPredictor = new SequencePredictor({ maxOrder: 15, random: () => 0.25 });
  let longestContextUsed = 0;

  for (const key of "df".repeat(30)) {
    shortPredictor.record(key);
    const result = longPredictor.record(key);
    longestContextUsed = Math.max(longestContextUsed, result.predictionOrder || 0);
  }

  assert.equal(shortPredictor.models.length, 4);
  assert.equal(shortPredictor.warmup, 3);
  assert.equal(longPredictor.models.length, 16);
  assert.equal(longPredictor.warmup, 5);
  assert.equal(longestContextUsed, 15);
});

test("reset clears the learned sequence and score", () => {
  const predictor = new SequencePredictor();
  for (const key of "dddddddd") predictor.record(key);
  predictor.reset();

  assert.deepEqual(predictor.sequence, []);
  assert.equal(predictor.predictions, 0);
  assert.equal(predictor.correct, 0);
  assert.deepEqual(predictor.accuracyHistory, []);
});

test("replays the complete sequence at a new memory without losing inputs", () => {
  const sequence = "dfddfdfdffddfdfddffdffdf";
  const replay = replaySequence(sequence, {
    maxOrder: 15,
    random: createSeededRandom(),
  });

  assert.equal(replay.predictor.sequence.join(""), sequence);
  assert.equal(replay.predictor.maxOrder, 15);
  assert.equal(replay.predictor.predictions, sequence.length - replay.predictor.warmup);
  assert.equal(replay.predictor.accuracyHistory.length, replay.predictor.predictions);
  assert.equal(replay.snapshot.presses, sequence.length);
});

test("replaying the same memory and sequence produces the same score history", () => {
  const sequence = "dffdffddfdfddffdffdfdfddffdffddf";
  const firstReplay = replaySequence(sequence, {
    maxOrder: 8,
    random: createSeededRandom(),
  });
  const secondReplay = replaySequence(sequence, {
    maxOrder: 8,
    random: createSeededRandom(),
  });

  assert.equal(firstReplay.predictor.correct, secondReplay.predictor.correct);
  assert.deepEqual(firstReplay.predictor.accuracyHistory, secondReplay.predictor.accuracyHistory);
});

test("chart points stay inside the plotting area", () => {
  const points = chartCoordinates([1, 0.5, 0]);

  assert.deepEqual(points[0], { x: 2, y: 2 });
  assert.deepEqual(points[1], { x: 320, y: 44 });
  assert.deepEqual(points[2], { x: 638, y: 86 });
});

test("rejects keys outside the experiment", () => {
  const predictor = new SequencePredictor();
  assert.throws(() => predictor.record("x"), /only accepts d or f/);
});
