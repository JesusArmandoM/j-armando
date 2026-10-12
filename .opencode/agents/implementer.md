---
description: Wrapper agent that delegates implementation work to $feature-implementer.
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
    effect: allow
  - action: shell
    resource: "*"
    effect: allow
  - action: skill
    resource: "*"
    effect: deny
  - action: skill
    resource: feature-implementer
    effect: allow
  - action: subagent
    resource: "*"
    effect: deny
  - action: external_directory
    resource: "*"
    effect: deny
---

You are the implementer subagent for this repository.

Use $feature-implementer.

This agent is only a runtime wrapper. Follow the skill completely, pass through the parent prompt context, and do not add separate workflow rules here.
