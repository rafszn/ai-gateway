# Repository Instructions

## 1. Authority and Source of Truth

The current working directory is the authoritative source of truth for the application's actual implementation.

create a corresponding <project-name> - architecture reference.md document that outlines the durable record of architectural decisions, implementation progress, outstanding work, and session handoffs.

Conversation history is supplementary context. Previous assistant responses, proposed files, and remembered decisions do not prove that code exists in the repository.

When sources disagree:

1. Inspect the relevant files in the current working directory.
2. Use available Git status and diffs to understand actual changes.
3. Compare the findings with the <project-name> - architecture reference.md.
4. Resolve discrepancies before proposing further implementation.

Never assume that the user applied code returned in a previous response.

## 2. Strict File Modification Permissions

The user applies all application code manually.

You MUST NOT create, edit, overwrite, rename, move, delete, or otherwise modify any project file except the designated architecture reference document.

**The <project-name> - architecture reference.md is the only file you are authorized to edit or append to.**

This prohibition includes source code, tests, configuration, package manifests, lockfiles, scripts, generated files, and all other documentation.

Do not apply patches, use file-writing commands, run formatters that modify files, perform automated refactors, or invoke tools that indirectly change project files.

You may inspect files, search the repository, read Git status and diffs, and perform read-only analysis.

Return all application implementations directly in chat. Never write them into the working directory.

If a requested task would ordinarily involve modifying a file, return the proposed implementation in chat instead.

## 3. Implementation Delivery Rules

Every implementation file must have:

- An explicit **NEW** or **UPDATED** label.
- Its exact repository-relative path.
- Complete file contents by default.

Use NEW only when the file does not currently exist. Use UPDATED when modifying an existing file.

Determine the correct label by inspecting the current working directory, not by relying on conversation history or the architecture reference alone.

Return complete files unless a change is genuinely small and a targeted replacement is clearer. For targeted changes, identify the exact location and provide the replacement content.

For multi-file implementations, present each file separately and clearly.

Do not repeat files or implementations that already exist in the repository unless an actual modification is necessary.

Never claim that code returned in chat has been applied.

## 4. Mandatory Pre-Implementation Reconciliation

Before proposing any implementation:

1. Read the relevant parts of the architecture reference document.
2. Inspect the current repository structure and relevant existing files.
3. Read the actual contents of files that will be affected.
4. Check prior implementation records and relevant architectural decisions.
5. Compare the proposed work with the actual implementation.
6. Identify what already exists, what is incomplete, what is missing, and what remains unconfirmed.
7. Propose only the changes needed for the current task.

Do not rely on a previous chat response as a substitute for inspecting a file.

If the implementation already exists, do not return it again merely because the user requested a related feature.

If an earlier proposal is absent from the working directory, do not assume it was applied. Determine whether it is still needed and propose only the necessary work.

If you cannot establish the current state with sufficient confidence, explain the uncertainty before proceeding.

Keep inspections proportional to the task. Inspect the relevant modules rather than repeatedly scanning the entire repository when a focused inspection is sufficient.

## 5. Context Compaction and Session Continuity

These instructions apply regardless of conversation length, context compaction, or session changes.

Never depend exclusively on conversational memory to determine project state.

Reconcile the <project-name> - architecture reference.md with the actual working directory:

- At the beginning of a new session.
- Before starting a new feature or substantial implementation.
- After significant architectural or implementation milestones.
- After context compaction whenever continuity or implementation status is uncertain.
- When the user reports applying changes, encountering a bug, or changing a requirement.
- Before repeating a previously proposed implementation.

After context compaction, recover missing information by inspecting the reference document and relevant repository files. Do not reconstruct the implementation state from a condensed conversation summary alone.

Preserve established conventions and architectural decisions unless the user changes them or evidence demonstrates that they need correction.

## 6. Implementation Status and Evidence

Track implementation status explicitly in the <project-name> - architecture reference.md.

Use these statuses consistently:

- **PROPOSED**: Returned in chat. Application has not been confirmed.
- **APPLIED**: The user confirms applying the code, or the implementation is observable in the working directory.
- **VERIFIED**: The implementation has been checked against a specific verification criterion.
- **BLOCKED**: Work cannot proceed without a missing decision, dependency, or action.
- **SUPERSEDED**: A newer implementation or architectural decision replaces the earlier one.

Distinguish between code being present, code being inspected, and code being tested. These are not equivalent.

When the user confirms applying an implementation, reconcile the relevant files before updating the status.

If a change is observable in the working directory, record the evidence. Do not imply that the presence of a file proves its behavior is correct.

Never mark an implementation VERIFIED without evidence and a clear description of what was verified.

## 7. Architecture Reference Maintenance

After every implementation response, update the existing architecture reference document to record the proposed work and current progress.

The <project-name> - architecture reference.md is the only project file you may modify.

Use the existing document's established structure, terminology, and level of technical detail. Preserve its existing architectural knowledge. Do not replace the document with a generic template or rewrite unrelated sections unnecessarily.

For each meaningful implementation, record:

- The feature or change.
- The affected file paths.
- The current implementation status.
- Relevant architectural decisions and constraints.
- Dependencies, blockers, and unresolved questions.
- The next logical step when applicable.

New code returned in chat must be recorded as PROPOSED unless application has already been confirmed or the change is observable in the repository.

Do not record proposed behavior as an implemented capability.

When actual repository state differs from the reference, document the discrepancy and reconcile it based on evidence.

Keep the reference concise enough to serve as a practical handoff document, but preserve the architectural details needed for future implementation.

Do not create additional progress files or tracking documents.

If the designated architecture reference cannot be located, do not create or modify a substitute. Ask the user to identify the correct file.

## 8. Verification and Testing

The user normally applies implementations and runs tests independently.

Do not run tests, builds, migrations, application startup commands, or other potentially state-changing operations unless explicitly requested.

Read-only inspection, static reasoning, and source-level verification are permitted when useful.

Verify factual claims about library behavior, APIs, TypeScript, database semantics, and edge cases when the available environment permits reliable verification.

When verification is not performed, state that plainly. Distinguish verified facts from assumptions, inferences, and untested expectations.

Do not claim a build succeeds or tests pass without actually running the relevant checks and observing their results.

Identify material correctness problems and edge cases before presenting an implementation.

## 9. Architectural Consistency

Follow the established project conventions recorded in the architecture reference (or create a concise well detailed one from current repository) and confirmed in the current repository.

Before introducing a new pattern, check whether an existing convention already addresses the problem.

Apply agreed conventions consistently across related files and services. If a new decision invalidates earlier work, identify the inconsistency and propose the necessary correction.

Do not silently change architectural decisions, introduce speculative abstractions, or broaden the task without justification.

Flag relevant edge cases, conflicts, and missing requirements briefly and directly.

## 10. Implementation Response Format

For each implementation task, provide:

1. A concise description of the intended change.
2. Each file labeled **NEW** or **UPDATED**, with its exact path and implementation.
3. Important edge cases, assumptions, or unresolved decisions.
4. What was actually inspected or verified and what remains unverified.
5. Confirmation that the architecture reference was updated, identifying the progress recorded.

Do not claim the implementation has been applied to application files.

Do not run tests unless explicitly requested.

## 11. User Authority

The user controls implementation, file application, and testing.

The user may change architectural decisions or explicitly expand file permissions.

Unless the user explicitly changes the permissions, the <project-name> - architecture reference.md remains the only file you may write.

When an instruction conflicts with these restrictions, return the required implementation in chat rather than modifying an unauthorized file.
