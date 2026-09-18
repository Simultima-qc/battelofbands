# Core Game Loop — MVP Contract

## Product hypothesis

Battle of Bands is a fast personal music-preference game.

The MVP question is simple:

> Can a short sequence of difficult head-to-head choices produce a result that feels personal enough to finish, care about, and replay?

The bracket is a mechanic serving that experience. It is not the product by itself.

The machine-readable companion to this document is:

`product/core_game_loop.json`

## Authoritative MVP session

The default MVP session is:

- **16 artists**
- **15 decisions**
- **4 rounds**
  - Round of 16
  - Quarterfinals
  - Semifinals
  - Final

Do not expose tournament-size selection in the MVP.

The current 32-artist implementation remains useful code, but 32 / 31 decisions is no longer the target product contract.

The 16-artist choice is a **hypothesis to validate**, not a claim that 16 is universally optimal.

## Core loop

```text
Choose one category
        ↓
See two artists
        ↓
Make one forced choice
        ↓
Advance the winner
        ↓
Choices become harder
        ↓
Reveal personal result
        ↓
Replay
```

The product should minimize friction between two choices.

## Category rules

The player chooses one category dimension:

- genre;
- country;
- language.

A category value is eligible for the default MVP surface only when it has at least **16 unique eligible artists**.

If a category has fewer than 16 eligible artists:

- do not silently create a smaller bracket;
- do not show it as a normal MVP option.

This keeps session length and player expectations consistent.

## Artist eligibility

An artist can appear when:

- name is present;
- category metadata matches;
- the record is not a known duplicate identity.

Image availability is **not required** for this first contract.

The current dataset has no artist images, so visual enrichment should be evaluated separately rather than blocking the game-loop experiment.

## Selection policy

The default selection goal is:

**recognition-first with controlled surprise**

Use popularity-weighted random sampling without replacement.

The product should avoid both extremes:

- deterministic “always the 16 biggest stars”;
- pure uniform random that can create obscure or low-recognition brackets.

The repository already contains a popularity-weighted sampling concept. Future implementation should align the actual tournament-start path with that policy instead of inventing another selector.

## Match interaction

Every matchup asks one question:

> Which artist do you prefer?

MVP rules:

- one click/tap chooses the winner;
- no skip;
- no tie;
- no rating scale;
- no written explanation;
- advance immediately to the next matchup.

The interaction should feel closer to a rapid instinctive choice than a survey.

## End-of-session payoff

A completed tournament must surface:

- champion;
- finalist;
- Top 4 / semifinalists;
- chosen category;
- completed bracket.

The result should feel like **your tournament result**, not merely a backend winner record.

A permanent taste profile is deliberately deferred.

## Replay loop

Primary completion CTA:

**Play another tournament**

The player may then:
- choose another category;
- replay the same category with a different bracket.

The first return loop is intentionally small:

```text
finish
  → see result
  → play again
```

Do not require an account to make this loop valuable.

## Ranking semantics

Two concepts must remain distinct.

### Personal result

What happened in one player's completed tournament.

### Aggregate app ranking

Accumulated outcomes stored by the current application instance.

Until Battle of Bands has actual public multi-user traffic, the aggregate table must **not** be presented as a “World Ranking”.

## Completion accounting

A tournament counts as played for aggregate statistics only when it is completed.

Starting a tournament is not equivalent to playing it.

An abandoned tournament must not dilute artist averages.

This product rule intentionally differs from the current implementation, where `tournaments_played` is incremented at tournament start.

Fixing that behavior belongs in a later implementation issue, not in this contract issue.

## Future measurement

When product analytics are added, the MVP should be capable of measuring:

- tournament starts;
- tournament completions;
- votes cast;
- abandonment point / last completed round;
- immediate replay;
- category type;
- category value.

Those measurements will eventually answer whether 16 artists is the right session length.

Analytics implementation is not part of this issue.

## Explicit non-goals

Do not add these before the game loop earns them:

- accounts/authentication;
- community/social feed;
- multiplayer;
- comments;
- Spotify or Apple Music integration;
- audio previews;
- recommendation engine;
- full taste profile;
- variable tournament sizes;
- monetization;
- large visual redesign;
- public deployment;
- analytics implementation.

## Success condition

The MVP is successful when the product can test this loop cleanly:

```text
recognition
  → tension
  → choice
  → progression
  → personal result
  → replay
```

The next engineering work should improve the correctness and testability of that loop, not expand the platform.
