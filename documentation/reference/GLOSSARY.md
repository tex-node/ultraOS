---
title: Canonical Glossary
status: Draft
version: docs-0.1
last_updated: YYYY-MM-DD
---

# Canonical Glossary

## Athlete

The permanent person profile for a participant. An Athlete remains the same across seasons, clubs, and player registrations.

## Player

An Athlete registered to participate in a specific Season. Player is season-specific.

## SeasonClub

A Club's participation record in a specific Season, Competition, or Division. Use SeasonClub for fixtures, standings, rosters, draft picks, and competitive stats.

## Club

The permanent brand identity of a team organization, including name, colors, logo, history, fans, and sponsorship value.

## DraftEvent

The operational event used to run draft activities, squads, picks, readiness, and live draft workflows.

## Season

A defined competitive period under a Competition.

## Fixture

The scheduled match record, including planned date, venue, and participating SeasonClubs.

## Game

The live or played instance of a Fixture, including scoring and finalization.

## Standing

The calculated ranking record for a SeasonClub within a Season and Division.

## TrainingSession

A scheduled training or assessment session used to track attendance, development, and metrics.

## Application

A submitted request by a user to participate as a Player, Coach, Scout, Official, Vendor, Media member, or Volunteer.

## User

The login identity. A User can have multiple roles and profiles.

## Staff

A person serving an operational role such as Coach, Scout, Official, Team Manager, or Volunteer.

## Vendor

An approved business or individual that sells goods or services through event operations.

## Fan Club

A fan membership group associated with a Club or league community.

## Competition

A sport-specific competition structure that contains Seasons and Divisions.

## Division

A competition grouping such as men's, women's, age-grade, or skill-level division.

## Sport

The top-level sporting discipline, such as basketball, volleyball, tennis, football, or cricket. A Sport is described by a Sport Definition.

## Entrant

The competing unit in a Competition, Season, and Division. An Entrant is a team, an individual, a pair, or a relay, allowing individual sports such as tennis to compete without a Club. A SeasonClub is represented as one TEAM Entrant.

## Entrant Member

A person participating in an Entrant, linking an Athlete to the Entrant with a role and optional order.

## Sport Definition

The versioned, code-registered description of a sport's structure, scoring, events, metrics, standings rules, roster rules, surface, and optional capabilities. A database override may customize it per organization. The Sport Definition is the authority for all sport-specific behaviour.

## Capability Module

An optional behavioural module enabled by a Sport Definition, such as Draft, Shot Clock, Ultra Time, Four Point, Innings, Rotation, or Surface Vision. Features are gated by capabilities, not by sport name.

## Metric Definition

A declared statistic a sport can capture, including its key, label, value type, subject scope, aggregation, and the events it derives from.

## Game Metric Value

A single measured statistic for a Game, keyed by subject (player or Entrant) and Metric Definition, with provenance back to its source event when derived.

## Standing Metric

A sport-specific additional standings value, such as net run rate (cricket) or set ratio (volleyball), attached to a Standing row.

## Surface Specification

A sport-declared playing-surface description (court, pitch, or field) used for venue setup and, optionally, spatial vision. Replaces the basketball-only Court Specification as the general concept.

## Ultra Athlete ID

The public identifier assigned to an Athlete. Format examples should use `UBA-000001`.

## Ultra Staff ID

The public identifier assigned to Staff. Format examples should use `UBS-000001`.

