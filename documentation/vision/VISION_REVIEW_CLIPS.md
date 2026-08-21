# Vision Review Clips

G.22, Parts XLIX-LIV. Architecture-only - no clip-generation code was built this track.

## What was asked for

Part XLIX asks for short review clips (a few seconds of video around a disputed
observation/event-match) to make human review faster than scrubbing a full game video. This is a
real, useful feature - but it requires a working video transcoding step (extracting a sub-range
from a source file), which in turn requires both a real source video and either `ffmpeg` or an
equivalent tool, neither of which exists in this environment (see `VIDEO_INGESTION_PIPELINE.md`'s
confirmation that `ffprobe`/`ffmpeg` are absent from both the server and dev machine).

## Why nothing was stubbed here

Building a clip-generation function against zero real video would have nothing real to prove
itself against, and a fake/mocked version would risk being mistaken for working functionality
later (the same reasoning `VIDEO_INGESTION_PIPELINE.md` gives for not building resumable upload).
Part XLIX itself doesn't require clips to exist this track - only that the review workflow (which
already exists: `reviewObservationAction`/`reviewEventMatchAction`) doesn't structurally block
adding a clip preview later.

## What the existing review UI already supports today

`/vision/games/[fixtureId]`'s review queues show `videoTimeMs` for every pending
observation/match, which is exactly the timestamp a future clip-generation step would need as its
input - no schema gap exists for adding this later, only the transcoding implementation.

## Current empirical status

Not built. `VISION_INGESTION_READY` architecture exists to support it once real video and a real
transcoding tool are available; zero clips have ever been generated.
