# Record Club Wrapped: note reranking ideas

The two note awards currently say **in construction**. Do not name winners from note length or keyword counts. This document records the intended editorial pass for a later iteration; no TypeSafe AI calls are implemented yet.

## Approach

TypeSafe AI's [reranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe) shows a shortlist scored one candidate at a time against a focused question, followed by a sort on the returned score. Its [Score primitive](https://docs.typesafe.ai/primitives/score) describes rubrics with ordered criteria and returned score and confidence. For Wrapped, shortlist notes from the current group and season, pass a single note with enough album context to each scoring call, and sort by the score. Keep group IDs out of any cross-group comparison. Cache results by season, rubric version, and note text hash. Require enough evidence and review the leading notes before putting a person's name on a subjective award.

## Approved cards waiting for reranking

- **A hill worth dying on**: a note that makes a specific, persuasive case for a record. Score the strength and distinctiveness of the argument, not its length or intensity alone.
- **One-sentence liner note**: a brief note that captures a record with unusual precision or personality. Shortlist true one-sentence notes; score how much the sentence conveys, not just how few words it uses.

## More candidates to consider

- **You had to be there**: the note that most vividly places a record in a time or place.
- **Unexpected comparison**: the most illuminating comparison to something outside the record's obvious genre.
- **The conversion pitch**: the note most likely to make another member press play, scored for concrete reasons rather than hype.
- **A perfect little detail**: the sharpest observation about one sound, lyric, performance, or transition.
- **Changed my mind**: a note that best explains a genuine shift in the writer's relationship with a record.
- **The group chat quote**: a line with memorable phrasing that still conveys something specific about the music.

For any future card, link the cited note to `/records/lists/` and the relevant album or track to Spotify. Avoid showing a winner when notes are too sparse or the top scores are close and low confidence.
