(() => {
  "use strict";

  const KEYS = new Set(["d", "f"]);
  const DEFAULT_ORDER = 5;
  const UI_RANDOM_SEED = 0x5eed1234;
  const PLOT = { left: 2, right: 638, top: 2, bottom: 86 };

  function createSeededRandom(seed = UI_RANDOM_SEED) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  class SequencePredictor {
    constructor(options = {}) {
      this.maxOrder = options.maxOrder || DEFAULT_ORDER;
      this.warmup = options.warmup ?? Math.min(this.maxOrder, DEFAULT_ORDER);
      this.random = options.random || Math.random;
      this.reset();
    }

    reset() {
      this.sequence = [];
      this.models = Array.from({ length: this.maxOrder + 1 }, () => new Map());
      this.predictions = 0;
      this.correct = 0;
      this.accuracyHistory = [];
    }

    context(order) {
      if (order === 0) return "";
      return this.sequence.slice(-order).join("");
    }

    predict() {
      if (this.sequence.length < this.warmup) return null;

      for (let order = Math.min(this.maxOrder, this.sequence.length); order >= 0; order -= 1) {
        const counts = this.models[order].get(this.context(order));
        if (!counts || counts.d + counts.f === 0) continue;
        if (counts.d > counts.f) return { key: "d", order };
        if (counts.f > counts.d) return { key: "f", order };
        return { key: this.random() < 0.5 ? "d" : "f", order };
      }

      return { key: this.random() < 0.5 ? "d" : "f", order: 0 };
    }

    learn(key) {
      const highestOrder = Math.min(this.maxOrder, this.sequence.length);
      for (let order = 0; order <= highestOrder; order += 1) {
        const model = this.models[order];
        const context = this.context(order);
        const counts = model.get(context) || { d: 0, f: 0 };
        counts[key] += 1;
        model.set(context, counts);
      }
    }

    record(input) {
      const key = String(input || "").toLowerCase();
      if (!KEYS.has(key)) throw new Error("SequencePredictor only accepts d or f.");

      const prediction = this.predict();
      let wasCorrect = null;

      if (prediction) {
        wasCorrect = prediction.key === key;
        this.predictions += 1;
        if (wasCorrect) this.correct += 1;
        this.accuracyHistory.push(this.correct / this.predictions);
      }

      this.learn(key);
      this.sequence.push(key);

      return {
        key,
        prediction: prediction ? prediction.key : null,
        predictionOrder: prediction ? prediction.order : null,
        wasCorrect,
        predictions: this.predictions,
        correct: this.correct,
        accuracy: this.predictions ? this.correct / this.predictions : null,
        presses: this.sequence.length,
        warmupRemaining: Math.max(0, this.warmup - this.sequence.length),
      };
    }
  }

  function chartCoordinates(history) {
    if (!history.length) return [];
    const width = PLOT.right - PLOT.left;
    const height = PLOT.bottom - PLOT.top;
    return history.map((accuracy, index) => ({
      x: history.length === 1 ? PLOT.left : PLOT.left + (index / (history.length - 1)) * width,
      y: PLOT.top + (1 - accuracy) * height,
    }));
  }

  function replaySequence(inputSequence, options = {}) {
    const replayedPredictor = new SequencePredictor(options);
    let snapshot = null;

    for (const key of inputSequence) {
      snapshot = replayedPredictor.record(key);
    }

    return { predictor: replayedPredictor, snapshot };
  }

  function startExperiment() {
    const root = document.querySelector(".free-will-instrument");
    if (!root) return;

    function createUiPredictor(maxOrder = DEFAULT_ORDER) {
      return new SequencePredictor({ maxOrder, random: createSeededRandom() });
    }

    let predictor = createUiPredictor();
    const orderInput = document.getElementById("free-will-order");
    const orderValue = document.getElementById("free-will-order-value");
    const methodOrder = document.getElementById("free-will-method-order");
    const accuracy = document.getElementById("free-will-accuracy");
    const correct = document.getElementById("free-will-correct");
    const predictions = document.getElementById("free-will-predictions");
    const result = document.getElementById("free-will-result");
    const sequence = document.getElementById("free-will-sequence");
    const chartLine = document.getElementById("free-will-chart-line");
    const chartPoint = document.getElementById("free-will-chart-point");
    const chartSummary = document.getElementById("free-will-chart-summary");
    const chartDescription = document.getElementById("free-will-graph-description");
    const reset = document.getElementById("free-will-reset");
    const buttons = [...root.querySelectorAll("[data-key]")];
    const pressTimers = new WeakMap();

    function warmupMessage() {
      return `${predictor.warmup} warm-up ${predictor.warmup === 1 ? "press" : "presses"}.`;
    }

    function updateChart() {
      const history = predictor.accuracyHistory;
      const points = chartCoordinates(history);

      if (!points.length) {
        chartLine.setAttribute("d", "");
        chartPoint.hidden = true;
        chartSummary.textContent = "waiting for data";
        chartDescription.textContent = "No scored predictions yet.";
        return;
      }

      const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
      const last = points[points.length - 1];
      const latestPercent = Math.round(history[history.length - 1] * 100);

      chartLine.setAttribute("d", path);
      chartPoint.setAttribute("cx", last.x.toFixed(2));
      chartPoint.setAttribute("cy", last.y.toFixed(2));
      chartPoint.hidden = false;
      chartSummary.textContent = `${history.length} ${history.length === 1 ? "prediction" : "predictions"} · ${latestPercent}%`;
      chartDescription.textContent = `After ${history.length} scored ${history.length === 1 ? "prediction" : "predictions"}, the predictor is ${latestPercent} percent accurate.`;
    }

    function updateSequence() {
      const allKeys = predictor.sequence.join("");
      const visibleKeys = allKeys.length > 48 ? `…${allKeys.slice(-48)}` : allKeys;
      sequence.textContent = visibleKeys || "—";
      sequence.setAttribute("aria-label", allKeys ? `Sequence: ${allKeys.split("").join(" ")}` : "Sequence is empty");
    }

    function render(snapshot) {
      accuracy.textContent = snapshot.accuracy === null ? "—" : `${Math.round(snapshot.accuracy * 100)}%`;
      correct.textContent = String(snapshot.correct);
      predictions.textContent = String(snapshot.predictions);
      delete result.dataset.result;

      if (!snapshot.prediction) {
        const remaining = snapshot.warmupRemaining;
        result.textContent = remaining
          ? `${remaining} warm-up ${remaining === 1 ? "press" : "presses"} remaining.`
          : "The predictor is ready.";
      } else {
        result.dataset.result = snapshot.wasCorrect ? "correct" : "wrong";
        result.textContent = `Machine guessed ${snapshot.prediction.toUpperCase()} · ${snapshot.wasCorrect ? "correct" : "wrong"}.`;
      }

      updateSequence();
      updateChart();
    }

    function resetDisplay(message = warmupMessage()) {
      accuracy.textContent = "—";
      correct.textContent = "0";
      predictions.textContent = "0";
      delete result.dataset.result;
      result.textContent = message;
      updateSequence();
      updateChart();
    }

    function setOrder(nextOrder) {
      orderValue.textContent = `${nextOrder}-gram`;
      methodOrder.textContent = String(nextOrder);
      if (predictor.maxOrder === nextOrder) return;

      const recordedSequence = predictor.sequence.slice();
      const replay = replaySequence(recordedSequence, {
        maxOrder: nextOrder,
        random: createSeededRandom(),
      });
      predictor = replay.predictor;

      if (!replay.snapshot) {
        resetDisplay(`${nextOrder}-gram selected · ${warmupMessage()}`);
        return;
      }

      render(replay.snapshot);
      delete result.dataset.result;

      if (predictor.predictions) {
        result.textContent = `${nextOrder}-gram · rescored ${predictor.predictions} ${predictor.predictions === 1 ? "prediction" : "predictions"}.`;
      } else if (replay.snapshot.warmupRemaining) {
        const remaining = replay.snapshot.warmupRemaining;
        result.textContent = `${nextOrder}-gram · ${remaining} warm-up ${remaining === 1 ? "press" : "presses"} remaining.`;
      } else {
        result.textContent = `${nextOrder}-gram · predictor ready.`;
      }
    }

    function flashButton(key) {
      const button = buttons.find((candidate) => candidate.dataset.key === key);
      if (!button) return;
      const oldTimer = pressTimers.get(button);
      if (oldTimer) window.clearTimeout(oldTimer);
      button.classList.remove("is-pressed");
      void button.offsetWidth;
      button.classList.add("is-pressed");
      const timer = window.setTimeout(() => button.classList.remove("is-pressed"), 110);
      pressTimers.set(button, timer);
    }

    function handlePress(key) {
      const snapshot = predictor.record(key);
      flashButton(key);
      render(snapshot);
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => handlePress(button.dataset.key));
    });

    orderInput.addEventListener("input", () => {
      setOrder(Number(orderInput.value));
    });

    document.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (!KEYS.has(key) || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      handlePress(key);
    });

    reset.addEventListener("click", () => {
      predictor = createUiPredictor(predictor.maxOrder);
      resetDisplay();
      buttons[0].focus();
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SequencePredictor, chartCoordinates, createSeededRandom, replaySequence };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startExperiment);
    } else {
      startExperiment();
    }
  }
})();
