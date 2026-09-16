# OTA Platform UI/UX Design Specification

## Product Character

The dashboard is an internal engineering/operations tool.

It should feel:
- professional.
- clean.
- technical.
- reliable.
- information-dense without clutter.
- easy to scan.
- safe for high-impact actions.

Do not design it like a consumer entertainment app.

# 1. Main Navigation

Recommended:

```text
Overview
Devices
Firmware
Deployments
OTA History
Settings
```

If existing navigation exists, integrate rather than replace it.

# 2. Overview Page

KPI cards:

```text
Total Devices
Recently Online
Outdated Firmware
Active Deployments
OTA Success Rate
OTA Failures
```

Firmware distribution example:

```text
v1.5.0    62%
v1.4.2    31%
v1.3.8     7%
```

Attention section:
- failed OTA devices.
- rollback events.
- stale deployments.
- repeatedly failing devices.

# 3. Devices Page

Columns:

```text
Device ID
Product
Hardware
Current Firmware
Target Firmware
Last Seen
OTA Status
Site/Group
```

Filters:
```text
Firmware
Hardware
OTA status
Online/recent
Device ID
Site/group
```

# 4. Device Detail Page

Show:
- identity.
- current OTA state.
- deployment.
- retry count.
- last error.
- OTA timeline.
- firmware history.

# 5. Firmware Page

Columns:

```text
Version
Product
Hardware
File Size
Status
Created At
Created By
```

Actions:

```text
View
Create Deployment
Archive
```

Avoid direct one-click "Deploy to All".

# 6. Upload Firmware UX

Form:

```text
Firmware File
Version
Product
Hardware Version
Release Notes
```

After file selection show:

```text
Filename
Size
Version
SHA-256
```

Make clear:

```text
Uploading firmware does not deploy it.
```

# 7. Deployment Creation Wizard

## Step 1 — Firmware
Select firmware and show compatibility.

## Step 2 — Target
Choose:
```text
Specific devices
Device group
Site
Percentage
All compatible
```

## Step 3 — Rollout
```text
Max concurrency
Retry policy
Start now / save draft
```

## Step 4 — Review
Show:
```text
Firmware
Hardware
Number of devices
Excluded incompatible devices
Concurrency
```

## Step 5 — Confirm
Large rollout requires deliberate confirmation.

# 8. Deployment Detail

Show:
```text
Deployment Name
Firmware
Status
Created By
Started At
Target
Success
Updating
Waiting
Failed
Rolled Back
Progress
```

Actions:
```text
Pause
Resume
Cancel
Retry Failed
```

Dangerous actions require confirmation.

# 9. Status Language

Use consistent semantic states.

Do not rely only on color. Include text/icon/label.

# 10. Failure UX

Do not show only:

```text
OTA Failed
```

Show:

```text
HTTP_TIMEOUT
Wi-Fi disconnected during firmware download.
Attempt 2 of 3.
Last attempt: ...
```

# 11. Empty States

Example:

```text
No firmware uploaded yet.
Upload a firmware build to create your first deployment.
```

# 12. Loading & Refresh

Use:
- websocket/SSE if already available.
- polling if simpler.
- manual refresh fallback.

Do not add complex realtime infrastructure unless justified.

# 13. Responsive Design

Primary target: desktop.

Support tablet and basic mobile viewing.

# 14. Design System

Continue existing:
- Tailwind
- Material UI
- shadcn/ui
- Ant Design
- Chakra
- custom components

Do not introduce a second UI framework.

# 15. Typography & Layout

Use:
- clear hierarchy.
- compact tables.
- readable labels.
- consistent spacing.
- restrained cards.

Avoid:
- excessive gradients.
- giant decorative headers.
- unnecessary animations.
- excessive glassmorphism.
- marketing-style layouts.

# 16. Confirmation Design

Require confirmation for:

```text
Start deployment
Cancel deployment
Deploy to all devices
Retry large batch
Archive firmware
```

Show impact:

```text
You are about to target 842 devices with firmware 1.5.0.
```

# 17. Audit UX

Where important, show:
```text
Created by
Started by
Paused by
Cancelled by
Timestamp
```

# 18. UI Coding Rules for Codex

Codex must:
- inspect current component library.
- reuse components.
- preserve visual language.
- keep pages modular.
- avoid giant components.
- maintain loading/error/empty states.
- avoid fake production data.
- avoid destructive actions without confirmation.
- avoid unrelated redesign.
- run frontend build/lint.

# 19. UX Definition of Done

A user can:

```text
Upload firmware
-> Find it
-> Create deployment
-> Select devices
-> Review impact
-> Start
-> Monitor progress
-> Inspect failures
-> Pause if needed
-> Retry failed devices
-> View device history
```

without direct DB access.
