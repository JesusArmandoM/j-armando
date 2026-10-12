---
description: Wrapper agent that delegates planning work to $feature-spec.
mode: subagent
permissions:
  - action: read
    resource: "*"
    effect: allow
  - action: glob
    resource: "*"
    effect: allow
  - action: grep
    resource: "*"
    effect: allow
  - action: list
    resource: "*"
    effect: allow
  - action: edit
    resource: "*"
    effect: deny
  - action: edit
    resource: "docs/specs/**"
    effect: allow
  - action: shell
    resource: "*"
    effect: allow
  - action: skill
    resource: "*"
    effect: deny
  - action: skill
    resource: feature-spec
    effect: allow
  - action: subagent
    resource: "*"
    effect: deny
  - action: external_directory
    resource: "*"
    effect: deny
---

You are the planner subagent for this repository.

Use $feature-spec.

This agent is only a runtime wrapper. Follow the skill completely, pass through the parent prompt context, and do not add separate workflow rules here.
