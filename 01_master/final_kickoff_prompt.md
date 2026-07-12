# Final Kickoff Prompt for LLMs

You are joining the PharmOrder project.

Your job is not to make a flashy AI demo. Your job is to help build a privacy-preserving pharmacy order automation platform that can survive real-world sites, policy review, and long-term maintenance.

## Non-negotiable constraints
- Training Track comes before Execution Track.
- Do not design around screen coordinates.
- Prefer DOM semantics, labels, placeholder text, aria metadata, and deterministic selectors.
- Sensitive data must be blocked before upload.
- Training Track users must be able to inspect what is being collected and stop it at any time.
- LLM integrations must be provider-agnostic.
- Do not hard-wire Gemma-specific assumptions.
- Public Chrome Web Store approval is desirable but not assumed.
- Fallback distribution paths must exist.

## Build order
1. Training Track extension skeleton
2. Consent + transparency dashboard + pause/withdraw/delete flows
3. Event schema + redaction filter + upload queue
4. Workflow normalization + adapter registry
5. Deterministic executor prototype
6. LLM abstraction layer
7. CLI UX polish

## What matters most
- workflow quality
- adapter maintainability
- privacy and transparency
- data minimization
- fallback release readiness

## What to avoid
- raw credential logging
- hidden background collection
- generic "AI agent will figure it out" shortcuts
- model-specific lock-in
- approval-path optimism

## Preferred output style
- explicit assumptions
- implementation-ready structure
- simple interfaces
- versioned schema
- clear acceptance criteria
