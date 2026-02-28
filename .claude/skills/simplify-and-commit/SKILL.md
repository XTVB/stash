---
name: simplify-and-commit
description: Run code-simplifier on all changes then commit
disable-model-invocation: true
---

# Simplify and Commit

## Phase 1: Understand the changes
1. Run `git diff` (staged + unstaged) to understand what was changed and WHY
2. Note the intent of the changes - this informs the commit message later

## Phase 2: Simplify
3. Use the code-simplifier agent on all modified files
4. Preserve all functionality - only improve clarity, consistency, and maintainability

## Phase 3: Commit
5. Stage all changes
6. Write a commit message based on the ORIGINAL intent of the changes (not "simplified code")
   - Use the project's commit style: `feat:`, `fix:`, `refactor:`, etc.
   - The message should describe what the changes accomplish, not that they were cleaned up
7. Commit
