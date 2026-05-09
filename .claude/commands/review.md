---
name: review
description: Code review focused on PULSE architecture and quality
user-invocable: true
---

Review the code specified in $ARGUMENTS (file path or "all recent changes").
If no argument given, run `git diff --stat HEAD~1` to find recently changed files.

## Review criteria

### Backend (files in /api)
- Is the request flow correct: rate limit → cache → Claude call → parse → cache → return?
- Is JSON output strictly structured (no markdown, correct enums)?
- Are Claude API calls using the correct model (claude-sonnet-4-5-20250514)?
- Is max_tokens set to 4096?
- Is web_search_grounding_beta tool included where needed?
- Does error handling catch both Claude API failures and Yahoo Finance failures?

### Frontend (files in /public)
- Does the file use correct fonts: Cormorant Garamond (display), Space Mono (data), DM Sans (body)?
- Are animations GPU-accelerated only (transform + opacity)?
- Does prefers-reduced-motion work?
- Is live.js and bg.js imported correctly if used?
- Are semantic colors used consistently (green/red/amber)?

### General
- Any hardcoded values that should be env vars?
- Any console.log or debug code left in?
- Any TODO comments that block production readiness?

## Output format
Table with columns: File | Line | Severity (critical/warn/info) | Issue | Fix

End with: READY FOR DEPLOY or NEEDS FIXES
