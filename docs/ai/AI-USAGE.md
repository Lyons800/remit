# AI-assisted development

## Principle

AI tools accelerate research, planning, implementation, testing, and review.
They do not replace team understanding, sponsor documentation, live evidence, or
human accountability.

## Permitted use

- compare first-party documentation and SDK surfaces;
- draft architecture alternatives and ADRs;
- generate bounded implementation changes;
- propose unit, property, negative, and recovery tests;
- review diffs and failure modes;
- help produce synthetic demo fixtures; and
- improve documentation and reproducibility.

## Required human work

- choose and understand the architecture;
- verify sponsor behavior against first-party sources;
- review every committed change;
- control credentials and live accounts;
- run and inspect live sponsor integrations;
- validate claims and limitations;
- speak to sponsor engineers and users; and
- explain how the system works during judging.

## Repository evidence

The repository retains:

- architecture and delivery plans;
- ADRs for material decisions;
- sponsor integration notes and feedback;
- PR and commit history;
- test and evidence manifests; and
- session handoffs for multi-session continuity.

Raw chat transcripts are not automatically committed because they can contain
irrelevant, sensitive, or unverifiable content. Material instructions and
decisions are restated in reviewed repository artifacts.

## Prohibited behavior

- presenting generated or mocked evidence as live;
- accepting an AI claim instead of reading sponsor documentation;
- allowing an LLM to authorize or sign a financial effect;
- committing code the team cannot explain;
- using AI output as proof of beneficiary ownership or document truth; and
- bypassing review, tests, or provenance requirements because a change was
  machine-generated.
