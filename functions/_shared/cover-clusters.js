// "Cover twins": album art that had the same idea, grouped into named clusters (the smoking
// section, the petting zoo…). Membership comes from the cover descriptions
// (scripts/describe-covers.mjs) read with plain word rules, so a cluster is easy to check and
// never depends on a model at page time.

// A cluster shows only when it has this many covers, picked by at least two people.
const MIN_COVERS = 3;
const MIN_PICKERS = 2;
const MAX_CLUSTERS = 12;

const PEOPLE_NONE = /^(none|no people|nobody)$/i;

// Order is the order on the slide: the funniest first. `unit` finishes "N covers …".
export const COVER_CLUSTERS = [
  { id: "smoking", name: "Smoking section", unit: "with a cigarette",
    match: /\b(cigarettes?|cigars?|smoking|smokes)\b/ },
  { id: "animals", name: "Petting zoo", unit: "with an animal on them",
    match: /\b(dogs?|pupp(y|ies)|cats?|kittens?|horses?|horseback|birds?|pigs?|goats?|sheep|cows?|steers?|bulls?|deer|rabbits?|bunn(y|ies)|snakes?|monkeys?|bears?|lions?|tigers?|ducks?|chickens?|hens?|frogs?|lizards?|fish|owls?|wol(f|ves)|fox(es)?|parrots?|swans?|geese|goose|butterfl(y|ies)|moths?|insects?|bees?|spiders?|mantis(es)?|pon(y|ies)|animals?|dinosaurs?)\b/ },
  { id: "behind", name: "Camera shy", unit: "seen from behind",
    match: /\b(seen from (behind|the back)|from behind,|backs? (is )?(turned|to the (camera|viewer))|facing away|turned away)\b/ },
  { id: "lying", name: "Nap time", unit: "lying down",
    match: /\b(lying|lies (down|back|on|in|across)|reclin\w*|asleep|sleeping|sprawled|laying)\b/ },
  { id: "grass", name: "Touch grass", unit: "with grass on them",
    match: /\b(grass|grassy|meadows?|lawns?|pastures?)\b/ },
  { id: "western", name: "Saddle up", unit: "with a horse or a cowboy",
    match: /\b(horses?|horseback|cowboys?|cowgirls?|saddles?|rodeo|longhorns?|steers?|lasso|ranch)\b/ },
  { id: "skin", name: "Shirt optional", unit: "showing some skin",
    match: /\b(shirtless|bare[- ]chested|bare (chest|torso|legs|back|shoulders)|topless|nude|naked|swimsuit|bikini|underwear|lingerie)\b/ },
  { id: "embrace", name: "Get a room", unit: "with an embrace",
    match: /\b(kiss(es|ing)?|embrac(e|es|ing)|hug(s|ging)?|cuddl\w*|arms? around|holding hands|intertwined)\b/ },
  { id: "facial-hair", name: "Mustache club", unit: "with a mustache or beard",
    match: /\b(mustaches?|moustaches?|beards?|bearded|goatee|stubble)\b/ },
  { id: "glasses", name: "Four eyes", unit: "with glasses",
    match: /(?<!sun)\b(eye)?glasses\b|\bspectacles\b/ },
  { id: "tattoos", name: "Tattoo parlor", unit: "with tattoos",
    match: /\btattoo/ },
  { id: "snacks", name: "Snack break", unit: "with food or a drink",
    match: /\b(food|fruits?|bananas?(?! leaves)|apples?|cherr(y|ies)|lemons?|cake|pizza|burgers?|fries|sandwich|ice cream|candy|bread|eggs?|wine|beer|cocktails?|drinks?|coffee|cups?|mugs?|soda|popcorn|donuts?|plate of|bowl of|picnic|meal)\b/ },
  { id: "kids", name: "Kids’ table", unit: "with a kid",
    match: /\b(child|children|kids?|toddlers?|young (girl|boy)s?|little (girl|boy)s?|infant|baby(?! goat))\b/ },
  { id: "cars", name: "Parking lot", unit: "with a car",
    match: /\b(cars?|trucks?|vans?|convertible|sedan|pickup truck|bus|taxi|jeep|limousine|motorcycles?)\b/ },
  { id: "instruments", name: "Band practice", unit: "with an instrument",
    match: /\b(guitars?|trumpets?|drums?|drum kit|violins?|pianos?|saxophones?|cellos?|banjos?|harmonicas?|microphones?|keyboards?|bass guitar|accordion|flute)\b/ },
  { id: "hats", name: "Hat trick", unit: "with a hat",
    match: /\b(hats?|beanies?|berets?|bonnets?|bandanas?|headwraps?|head wraps?|turbans?|(baseball|knit|plaid|flat|peaked|newsboy|trucker) caps?|(wearing|wears|and|in) (a |an )?(\w+ )?caps?)\b/ },
  { id: "phones", name: "Screen time", unit: "with a phone or a screen",
    match: /\b(phones?|cellphone|smartphone|telephone|televisions?|tv|laptops?|computers?|music player|ipod)\b/ },
  { id: "mirror", name: "Mirror, mirror", unit: "with a mirror",
    match: /\bmirrors?\b/ },
  { id: "night", name: "Night shift", unit: "set at night",
    match: /\b(night|nighttime|moon|moonlit|starry)\b/ },
  { id: "face", name: "Face value", unit: "that are mostly a face",
    test: (cover) => !PEOPLE_NONE.test(cover.people) && !/crowd|group/i.test(cover.people)
      && /\b(face|close-?up)\b/.test(cover.subject) },
  { id: "nobody", name: "Nobody home", unit: "with no people at all",
    test: (cover) => PEOPLE_NONE.test(cover.people || "") },
];

// Words the cover itself prints ('coney island baby', "highway to hell") would trip the rules,
// so quoted text is dropped before matching.
function stripQuoted(text) {
  return text
    .replace(/"[^"]*"/g, " ")
    .replace(/“[^”]*”/g, " ")
    .replace(/(^|[\s(])'[^']+'(?=[\s.,;:)!?]|$)/g, "$1 ")
    .replace(/(^|[\s(])‘[^’]+’(?=[\s.,;:)!?]|$)/g, "$1 ");
}

export function coverText(description) {
  const parts = [description.description, description.subject, (description.objects || []).join(", ")];
  return stripQuoted(parts.filter(Boolean).join(" \n ").toLowerCase());
}

export function coverTraits(description) {
  const cover = {
    text: coverText(description || {}),
    subject: stripQuoted(String(description?.subject || "").toLowerCase()),
    people: String(description?.people || "").trim(),
  };
  return COVER_CLUSTERS.filter((cluster) =>
    cluster.test ? cluster.test(cover) : cluster.match.test(cover.text)).map((cluster) => cluster.id);
}

// albums: [{ ...album, pickers: [username], description: {...} }]
export function coverClusters(albums) {
  const byCluster = new Map(COVER_CLUSTERS.map((cluster) => [cluster.id, []]));
  for (const album of albums) {
    if (!album.description) continue;
    for (const id of coverTraits(album.description)) byCluster.get(id).push(album);
  }
  return COVER_CLUSTERS.map((cluster) => {
    const records = [...byCluster.get(cluster.id)].sort((a, b) =>
      String(a.artistName).localeCompare(String(b.artistName), "en", { sensitivity: "base" })
      || String(a.name).localeCompare(String(b.name), "en", { sensitivity: "base" }));
    const pickers = [...new Set(records.flatMap((record) => record.pickers))]
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    return { ...cluster, records, pickers };
  }).filter((cluster) => cluster.records.length >= MIN_COVERS && cluster.pickers.length >= MIN_PICKERS)
    .slice(0, MAX_CLUSTERS);
}
