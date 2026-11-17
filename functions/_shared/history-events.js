// Landmarks for the Wrapped time-traveler comparison: "1967 was closer to
// <event> (<year>) than to 2026." Keep them widely known and the years exact.
// Order does not matter; add or edit freely.
export const HISTORY_EVENTS = [
  [1776, "the Declaration of Independence"],
  [1789, "the French Revolution"],
  [1803, "the Louisiana Purchase"],
  [1815, "the Battle of Waterloo"],
  [1848, "the California Gold Rush"],
  [1859, "On the Origin of Species"],
  [1865, "the end of the American Civil War"],
  [1869, "the transcontinental railroad"],
  [1876, "the first telephone call"],
  [1879, "Edison's light bulb"],
  [1889, "the Eiffel Tower"],
  [1896, "the first modern Olympics"],
  [1903, "the Wright brothers' first flight"],
  [1908, "the Model T"],
  [1912, "the sinking of the Titanic"],
  [1914, "the start of World War I"],
  [1920, "American women winning the vote"],
  [1927, "the first talking picture"],
  [1929, "the Wall Street Crash"],
  [1933, "the end of Prohibition"],
  [1939, "The Wizard of Oz"],
  [1945, "the end of World War II"],
  [1947, "the invention of the transistor"],
  [1954, "Elvis's first single"],
  [1955, "the opening of Disneyland"],
  [1957, "Sputnik"],
  [1961, "the Berlin Wall going up"],
  [1964, "the Beatles on Ed Sullivan"],
  [1967, "the Summer of Love"],
  [1969, "the moon landing"],
  [1971, "the first email"],
  [1975, "Jaws"],
  [1977, "the first Star Wars"],
  [1979, "the Sony Walkman"],
  [1981, "the launch of MTV"],
  [1982, "the first CD"],
  [1984, "the first Macintosh"],
  [1989, "the fall of the Berlin Wall"],
  [1991, "the World Wide Web going public"],
  [1994, "the first PlayStation"],
  [1997, "Titanic (the movie)"],
  [1999, "Napster"],
  [2001, "the first iPod"],
  [2004, "the founding of Facebook"],
  [2005, "the first YouTube video"],
  [2007, "the first iPhone"],
  [2008, "the launch of Spotify"],
  [2010, "the launch of Instagram"],
  [2012, "Gangnam Style"],
  [2016, "Pokémon Go"],
  [2020, "the COVID lockdowns"],
  [2022, "ChatGPT"],
];

// The earliest landmark that the older year is still closer to than the newer one.
export function closerThanNow(oldest, newest) {
  const gap = newest - oldest;
  if (!(gap > 0)) return null;
  const candidates = HISTORY_EVENTS
    .filter(([eventYear]) => eventYear < oldest && oldest - eventYear < gap)
    .sort((a, b) => a[0] - b[0]);
  if (!candidates.length) return null;
  const [eventYear, event] = candidates[0];
  return { year: eventYear, event };
}
