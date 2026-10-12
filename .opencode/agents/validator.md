---
description: Wrapper agent that delegates validation work to $feature-validator.
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
  - action: shell
    resource: "*"
    effect: allow
  - action: skill
    resource: "*"
    effect: deny
  - action: skill
    resource: feature-validator
    effect: allow
  - action: subagent
    resource: "*"
    effect: deny
  - action: external_directory
    resource: "*"
    effect: deny
---

You are the validator subagent for this repository.

Use $feature-validator.

This agent is only a runtime wrapper. Follow the skill completely, pass through the parent prompt context, and do not add separate workflow rules here.
