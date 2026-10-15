const fs = require("node:fs");
const path = require("node:path");
const markdownIt = require("markdown-it");

const headings = {
  "Ballot introduction": "ballotIntroduction",
  "Standout tracks explanation": "standoutExplanation",
  "Games introduction": "gamesIntroduction",
  "Who Picked It game listing": "whoPickedListing",
  "Match The Record game listing": "matchListing",
  "Records Wrapped game listing": "wrappedListing",
  "Who Picked It instructions": "whoPickedInstructions",
  "Who Picked It scoring": "whoPickedScoring",
  "Match The Record instructions": "matchInstructions",
  "Match The Record round prompt": "matchRoundPrompt",
  "The whole room introduction": "listsIntroduction",
  "Records Wrapped introduction": "wrappedIntroduction",
  "Records Wrapped source note": "wrappedSourceNote",
};

const source = fs.readFileSync(path.join(__dirname, "record-club-copy.md"), "utf8");
const markdown = markdownIt({ html: false, typographer: true });
const sections = {};
let currentHeading = null;
let lines = [];

function saveSection() {
  if (!currentHeading) return;
  const key = headings[currentHeading];
  if (!key) throw new Error(`Unknown Record Club copy heading: ${currentHeading}`);
  if (sections[key]) throw new Error(`Duplicate Record Club copy heading: ${currentHeading}`);
  const body = lines.join("\n").trim();
  if (!body) throw new Error(`Empty Record Club copy section: ${currentHeading}`);
  sections[key] = key === "ballotIntroduction" ? markdown.render(body) : markdown.renderInline(body);
}

for (const line of source.split(/\r?\n/)) {
  const heading = line.match(/^## (.+)$/);
  if (heading) {
    saveSection();
    currentHeading = heading[1].trim();
    lines = [];
  } else if (currentHeading) {
    lines.push(line);
  }
}
saveSection();

for (const [heading, key] of Object.entries(headings)) {
  if (!sections[key]) throw new Error(`Missing Record Club copy heading: ${heading}`);
}

module.exports = sections;
