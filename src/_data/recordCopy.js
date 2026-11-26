const fs = require("node:fs");
const path = require("node:path");
const markdownIt = require("markdown-it");

const headings = {
  "Ballot introduction": "ballotIntroduction",
  "Standout tracks explanation": "standoutExplanation",
  "Minigames introduction": "gamesIntroduction",
  "Minigames countdown note": "openingNote",
  // Return to Sender was Whose Wax? and Who Picked It?, Staff Picks was Match The Record, and Liner Notes was
  // Records Wrapped; the keys keep the old names.
  "Return to Sender game listing": "whoPickedListing",
  "Staff Picks game listing": "matchListing",
  "Liner Notes game listing": "wrappedListing",
  "Flip Side game listing": "flipSideListing",
  "Crates game listing": "cratesListing",
  "Mixtapes game listing": "mixtapesListing",
  "Return to Sender instructions": "whoPickedInstructions",
  "Return to Sender scoring": "whoPickedScoring",
  "Staff Picks instructions": "matchInstructions",
  "Staff Picks round prompt": "matchRoundPrompt",
  "Flip Side instructions": "flipSideInstructions",
  "Crates instructions": "cratesInstructions",
  "Mixtapes instructions": "mixtapesInstructions",
  "The whole room introduction": "listsIntroduction",
  "Liner Notes introduction": "wrappedIntroduction",
  "Liner Notes source note": "wrappedSourceNote",
  "Liner Notes unlock explanation": "wrappedUnlockExplanation",
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
