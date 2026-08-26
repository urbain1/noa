# Noa — Project Overview

## What it is
Noa is a clinical coordination app for nurses. Nurses capture orders and tasks by voice, Noa structures them with AI and routes them to the right department, tracks status in real time, and generates SBAR handoff summaries at shift change.

## Who it's for, now vs. later
- **Beta (now):** Informal testing by nurses who are personal contacts of the founder, on their own phones, using synthetic patient data only. Testers span the UK, France, Switzerland, and the US concurrently, not phased by region. No formal deployment agreement, no ward-wide rollout, no IT involvement, in any of the four.
- **Next (3-6 months):** A small clinic or nursing home, in whichever region shows the strongest early signal, moving toward a real pilot with a data processing agreement if the beta goes well.
- **Later:** Real patient data in any region requires that region's specific compliance path first, a signed BAA and HIPAA-ready infrastructure for the US, HDS certification for France, FDPIC registration for Switzerland, DPIA and ICO registration for the UK, and/or the full NHS accreditation route if targeting NHS trusts specifically. See `SECURITY.md`. Budget significant time regardless of which region moves first.

## Explicit non-goals for this phase
- No real, identifiable patient data under any circumstances, until a formal pilot agreement is in place. See `SECURITY.md`.
- No native mobile app. Web only, until the browser is a proven limitation from real testing.
- No multi-ward deployment, no admin/IT-managed rollout.

## Core value proposition
Replace the ad hoc, unshareable methods nurses currently use to track tasks and hand off shifts (personal notes apps, memory, paper), with something structured, shareable between colleagues, and safer than the status quo.

## Roadmap features already scoped (design pending, dedicated chat)
- **Ward manager screen:** assign and delegate duties across nurses. Nurses see only their own tasks plus anything shared to them directly.
- **Direct task handoff:** send a task, with full context, to another nurse's Noa account at shift end, not just a text summary.
- **All-tasks-by-urgency screen:** cross-patient task list sorted by priority, so a nurse doesn't have to open every patient card to see what's most urgent.
- **Handover report:** visually highlight incomplete/overdue tasks, not just list them.
- **Language toggle:** English/French UI switch, for nurse testers in France and Switzerland. Scope should cover AI-generated content too (SBAR summaries, patient updates), not just static UI chrome, given the first French tester is now confirmed. Full design deferred to its own chat.

## Success criteria for this beta
Not yet defined precisely, needs your input. Placeholder: nurse testers use Noa across real shifts without reverting to their prior informal method, and surface at least one workflow problem worth fixing before the next phase.
