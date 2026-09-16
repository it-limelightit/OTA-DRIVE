# First Codex Task Prompt — For a Half-Built Existing Project

Use this after copying all documentation files into the repository.

---

I have already built part of this OTA project. I do not want a rewrite.

Read all OTA documentation Markdown files first.

Then audit the current repository thoroughly and determine exactly what is already implemented versus missing.

Your first task is NOT to implement everything.

Your first task is to:

1. Inspect repository structure.
2. Inspect Git status and preserve all current work.
3. Run existing build/lint/test commands.
4. Trace current frontend, backend, database, MQTT, storage and OTA code.
5. Create `docs/CURRENT_STATE.md`.
6. Create a clear gap analysis against the architecture and phase documents.
7. Identify the earliest incomplete phase that should be completed next.
8. Implement that phase only if it can be completed safely without guessing missing product decisions.
9. Prefer a working vertical slice over broad partial scaffolding.
10. Run validation after changes.

Important:
- Existing MQTT device compatibility is high priority.
- Do not change MQTT topics unless necessary.
- Do not send firmware through MQTT.
- Use HTTPS/object storage for binaries.
- Do not add a new framework just because you prefer it.
- Do not create fake data for dashboard features.
- Do not mark OTA successful until new firmware reports healthy.
- Do not make fleet-wide uncontrolled rollout logic.
- Do not reset or clean Git.
- Do not modify unrelated features.

At the end, report:
- what existed,
- what was missing,
- what you implemented,
- exact files changed,
- migrations,
- env vars,
- tests/build results,
- remaining risks,
- next recommended phase.
