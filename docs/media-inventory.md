# Media inventory — all three batches (27 November 2026)

Public-safe. Items have neutral ids (`b<batch>-<nn>`, in sorted source order); the id-to-file map lives in the gitignored
`private/`. No filenames, paths, customer names or locations appear here. Originals were only read. Regenerate the table with
`node scripts/media-inventory.mjs` after editing the classification inside it.

## Method and limits
Metadata with sharp and ffprobe; every unpublished image viewed on a contact sheet; every unpublished video viewed as one
mid-clip frame (sampled, not watched through). "Quality" is a visual judgement, not a measurement. Published items were
judged earlier (see [media plan](media-plan.md)). Vintage and floral are the owner's priority subjects.

## Summary
| | Count |
|---|---|
| Files | 62 (46 photographs incl. 1 truncated, 9 screenshots, 7 clips) |
| Published (local derivatives): photographs / clips | 24 / 3 |
| Published subjects | 15 floral, 1 vintage+floral, 1 vintage clip, 10 celebration, mini-cake or other |
| Held: legible names | 17 files (incl. 2 clips) |
| Held: licensed characters | 4 files |
| Held: other (poor quality, duplicate, location, lettering) | 4 files |
| Screenshots (batch 3 are social posts/menus, plus the palette) | 9 files; business source material, not media |
| Unusable | 1 truncated HEIC |
| Metadata | Most originals carry GPS in EXIF; every derivative is re-encoded without metadata |
| Duplicates | no pixel-identical files; several near-duplicates (same cake, two photos or photo+clip) |

**Recommendation.** There is no additional vintage or floral item that is both clean and recorded as permitted. Every
remaining vintage or floral photograph shows a piped or topper name (b1-15, b1-32, b1-36, b2-09), has unclear lettering
(b1-26) or duplicates a published cake (b1-30). Nothing was added in this pass. The fastest gain is an owner decision:
either per-customer permission, or approval to crop or blur names. Candidates in priority order if that is given:
b1-36 and b1-32/b2-09 (vintage piped), b1-15 (floral two-tier), b1-26 (floral, needs a sharper re-shoot).

No per-asset permission record exists for any item, including the published ones: they are published locally on the owner's
selection and the name-legibility rule, and remain subject to the owner's rights review (see [content status](content-status.md)).

<!-- table -->
| id | type | size px / length | orientation | MB | subject | quality / note | status |
|---|---|---|---|---|---|---|---|
| b1-01 | image | 2304x4096 | portrait | 6.1 | floral | good; three tiers, red roses | published |
| b1-02 | image | 2304x4096 | portrait | 3.1 | other (character) | good | held: licensed character |
| b1-03 | image | 2304x4096 | portrait | 2.9 | other (castle) | good; names on cake and backdrop | held: name legible |
| b1-04 | image | 2304x3767 | portrait | 1.5 | other (mini cakes) | good | published |
| b1-05 | video | 2160x3840, 10.4s | portrait | 101.4 | other | clip; name legible; 4K 60 fps | held: name legible |
| b1-06 | image | 3072x4096 | portrait | 6.3 | other (celebration set) | good | published |
| b1-07 | video | 2160x3840, 3.6s, audio | portrait | 16.1 | other | clip; out of focus, audio track; same scene as the blue and yellow set | held: poor quality |
| b1-08 | image | 4330x5773 | portrait | 5.4 | floral | good | published |
| b1-09 | image | 3072x4096 | portrait | 5.8 | floral | good | published |
| b1-10 | image | 3072x4096 | portrait | 5.8 | floral | good | published |
| b1-11 | image | 3072x4096 | portrait | 1.8 | floral | good | published |
| b1-12 | image | 3072x4096 | portrait | 3.4 | floral | good | published |
| b1-13 | image | 4330x5773 | portrait | 6.8 | floral | good | published |
| b1-14 | image | 3072x4096 | portrait | 3.3 | floral | good | published |
| b1-15 | image | 3072x4096 | portrait | 7.6 | floral | good; name on cake | held: name legible |
| b1-16 | video | 2160x3840, 35.5s, audio | portrait | 413.2 | vintage | clip; piping demonstration, trimmed to avoid names; audio stripped | published |
| b1-17 | image | 6120x8160 | portrait | 5.1 | other | minor JPEG data errors; name on backdrop | held: name legible |
| b1-18 | image | 3000x4000 | portrait | 0.7 | floral | good | published |
| b1-19 | video | 2160x3840, 12.2s | portrait | 86.6 | other (celebration) | clip | published |
| b1-20 | video | 2160x3840, 12.3s | portrait | 125.5 | minis | clip | published |
| b1-21 | video | 2160x3840, 7.3s | portrait | 89.0 | other | clip; name on cake | held: name legible |
| b1-22 | image | 6120x8160 | portrait | 5.4 | other | minor JPEG data errors; name on cake | held: name legible |
| b1-23 | image | 6120x8160 | portrait | 5.4 | other | minor JPEG data errors; names on cake | held: name legible |
| b1-24 | image | 3000x4000 | portrait | 5.5 | celebration | good | published |
| b1-25 | image | 3000x4000 | portrait | 5.1 | minis | good | published |
| b1-26 | image | 3000x4000 | portrait | 3.5 | floral | soft focus; lettering on cake | held: lettering not cleared |
| b1-27 | image | 3456x4608 | portrait | 3.6 | floral | good; studio-style backdrop | published |
| b1-28 | image | 3840x5120 | portrait | 0.6 | other | name on stand and backdrop | held: name legible |
| b1-29 | image | 2304x4096 | portrait | 6.6 | celebration | good | published |
| b1-30 | image | 2304x4096 | portrait | 6.1 | floral | good; same cake family as b1-01, busy background | held: duplicate of a published cake |
| b1-31 | image | 2304x4096 | portrait | 6.2 | other | good; outdoor background shows a residential area | held: location visible |
| b1-32 | image | 3072x4096 | portrait | 7.7 | vintage | good; name on cake | held: name legible |
| b1-33 | image | 3072x4096 | portrait | 5.8 | celebration | good | published |
| b1-34 | image | 3072x4096 | portrait | 7.6 | celebration | good | published |
| b1-35 | image | 3072x4096 | portrait | 6.9 | other | name on cake | held: name legible |
| b1-36 | image | 3072x4096 | portrait | 7.6 | vintage | good; name piped on the front | held: name legible |
| b1-37 | image | 3072x4096 | portrait | 8.1 | vintage / floral | good | published |
| b1-38 | image | 3024x4032 | portrait | 1.0 | unknown | truncated HEIC, cannot be decoded | unusable: re-export needed |
| b1-39 | image | 4284x5712 | portrait | 2.5 | other | good; name on cake | held: name legible |
| b1-40 | image | 1080x1180 | portrait | 0.1 | palette reference | screenshot of the approved palette | not media: screenshot |
| b1-41 | video | 478x850, 10.6s, audio | portrait | 2.5 | other | clip; 478x850, burned-in social handle | held: licensed character and handle |
| b2-01 | image | 2304x4096 | portrait | 2.8 | floral | good | published |
| b2-02 | image | 2304x4096 | portrait | 2.8 | other | names on cake and backdrop; duplicate scene of b1-03 | held: name legible |
| b2-03 | image | 2304x4096 | portrait | 2.7 | floral | good | published |
| b2-04 | image | 5514x3629 | landscape | 4.1 | other | landscape; name on cake | held: name legible |
| b2-05 | image | 2304x4096 | portrait | 2.2 | other | name on cake and topper | held: name legible |
| b2-06 | image | 3072x4096 | portrait | 2.7 | floral | good | published |
| b2-07 | image | 1536x2048 | portrait | 0.6 | floral | good | published |
| b2-08 | image | 3072x4096 | portrait | 1.4 | other | name and licensed character | held: licensed character |
| b2-09 | image | 3072x4096 | portrait | 2.3 | vintage | good; name on cake | held: name legible |
| b2-10 | image | 3072x4096 | portrait | 1.3 | other | name on cake | held: name legible |
| b2-11 | image | 3072x4096 | portrait | 1.5 | celebration | good | published |
| b2-12 | image | 2525x3511 | portrait | 2.4 | other | name and licensed characters | held: licensed character |
| b2-13 | image | 4330x5773 | portrait | 4.1 | floral | good | published |
| b3-01 | image | 921x2048 | portrait | 0.1 | n/a | Instagram menu or post screenshot; carries a handle, prices, status bars | not media: screenshot |
| b3-02 | image | 921x2048 | portrait | 0.1 | n/a | Instagram menu or post screenshot; carries a handle, prices, status bars | not media: screenshot |
| b3-03 | image | 921x2048 | portrait | 0.1 | n/a | Instagram menu or post screenshot; carries a handle, prices, status bars | not media: screenshot |
| b3-04 | image | 921x2048 | portrait | 0.1 | n/a | Instagram menu or post screenshot; carries a handle, prices, status bars | not media: screenshot |
| b3-05 | image | 921x2048 | portrait | 0.1 | n/a | Instagram menu or post screenshot; carries a handle, prices, status bars | not media: screenshot |
| b3-06 | image | 921x2048 | portrait | 0.1 | n/a | Instagram menu or post screenshot; carries a handle, prices, status bars | not media: screenshot |
| b3-07 | image | 921x2048 | portrait | 0.1 | n/a | Instagram menu or post screenshot; carries a handle, prices, status bars | not media: screenshot |
| b3-08 | image | 921x2048 | portrait | 0.1 | n/a | Instagram menu or post screenshot; carries a handle, prices, status bars | not media: screenshot |
<!-- /table -->
