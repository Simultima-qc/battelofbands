# CLAUDE.md

This file instructs Claude Code, Claude, and other agents how to work in the Battle of Bands repository.

## Authoritative Rules

**Read first:** [`AGENTS.md`](AGENTS.md)

All project-specific execution rules, product invariants, verified operational facts, and canonical commands are documented in `AGENTS.md`. Do not duplicate those rules into other files. When in doubt about what is true, read `AGENTS.md`.

## Cross-Project Policy

For workflow, merge strategy, code review, release, and security policy not documented in `AGENTS.md`, refer to [`Simultima-qc/AI-Development-Playbook`](https://github.com/Simultima-qc/AI-Development-Playbook).

## Summary for Quick Reference

- **Repo:** Simultima-qc/battelofbands
- **Default branch:** main
- **Delivery:** direct PRs to main (no integration branch)
- **Stack:** Node.js + Express + SQLite / React + Vite
- **MVP invariants:** 16 artists / 15 decisions / 4 rounds; abandoned tournaments do not count; personal results distinct from app rankings
- **Test:** `cd server && npm test` and `cd client && npm test`
- **Build:** `cd client && npm run build`
- **Persistence:** local SQLite only; no deployment provider configured yet

---

**Document version:** 1.0 · 2026-09-19
