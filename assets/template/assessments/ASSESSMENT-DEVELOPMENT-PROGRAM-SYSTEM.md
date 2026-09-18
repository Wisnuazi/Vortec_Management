# ASSESSMENT — DEVELOPMENT PROGRAM / SYSTEM

## 1. Assessment Identity

Project / System Name:
Assessment ID:
Assessment Date:
Assessor:
Version:
Repository:
Environment:

Assessment Status:
- [ ] NOT STARTED
- [ ] IN REVIEW
- [ ] PARTIALLY READY
- [ ] READY
- [ ] BLOCKED
- [ ] REJECTED

---

## 2. Assessment Objective

State what is being assessed.

Example:
Evaluate whether the current system is sufficiently defined, architected, implemented, secured, tested, documented, and operationally ready for the next development or deployment stage.

---

## 3. Executive Summary

Overall Score:
`__/100`

Readiness:
- [ ] NOT READY
- [ ] PARTIALLY READY
- [ ] READY WITH CONDITIONS
- [ ] READY

Critical Blockers:
1.
2.
3.

Top Risks:
1.
2.
3.

Recommended Decision:
- [ ] CONTINUE
- [ ] CONTINUE WITH CONDITIONS
- [ ] HOLD
- [ ] REDESIGN
- [ ] STOP

---

# 4. BUSINESS & PROBLEM DEFINITION

## 4.1 Problem Statement

Is the problem clearly defined?

Evidence:

Assessment:
- [ ] Clear
- [ ] Partially Clear
- [ ] Unclear

Score:
`__/5`

Findings:

Risks:

Actions:

---

## 4.2 Users and Stakeholders

Primary users:

Secondary users:

Business owner:

Technical owner:

Operational owner:

Are responsibilities clear?
- [ ] Yes
- [ ] Partial
- [ ] No

Score:
`__/5`

---

## 4.3 Scope

Included:

Excluded:

Known scope ambiguity:

Scope stability:
- [ ] Stable
- [ ] Moderate
- [ ] Unstable

Score:
`__/5`

---

# 5. REQUIREMENTS ASSESSMENT

## 5.1 Functional Requirements

Are functional requirements documented?
- [ ] Complete
- [ ] Partial
- [ ] Missing

Are acceptance criteria defined?
- [ ] Yes
- [ ] Partial
- [ ] No

Requirements traceability available?
- [ ] Yes
- [ ] Partial
- [ ] No

Score:
`__/7`

Findings:

---

## 5.2 Non-Functional Requirements

Evaluate:

| Area | Defined | Measurable | Evidence | Risk |
|---|---|---|---|---|
| Performance | | | | |
| Availability | | | | |
| Scalability | | | | |
| Security | | | | |
| Maintainability | | | | |
| Reliability | | | | |
| Backup / Recovery | | | | |
| Observability | | | | |

Score:
`__/8`

---

# 6. ARCHITECTURE ASSESSMENT

## 6.1 Architecture Clarity

Architecture documented?
- [ ] Yes
- [ ] Partial
- [ ] No

Main components identified?
- [ ] Yes
- [ ] Partial
- [ ] No

Interfaces documented?
- [ ] Yes
- [ ] Partial
- [ ] No

Data flow documented?
- [ ] Yes
- [ ] Partial
- [ ] No

Score:
`__/7`

---

## 6.2 Technology Selection

Technology stack:

Frontend:

Backend:

Database:

Infrastructure:

External services:

Assessment:

Are technology choices justified?
- [ ] Yes
- [ ] Partial
- [ ] No

Are unnecessary dependencies present?
- [ ] No
- [ ] Some
- [ ] Significant

Score:
`__/5`

---

## 6.3 Scalability and Maintainability

Current expected load:

Future expected load:

Known limits:

Scaling strategy:

Maintainability risks:

Score:
`__/5`

---

# 7. IMPLEMENTATION QUALITY

## 7.1 Code Structure

Assess:
- modularity
- separation of concerns
- naming
- readability
- duplication
- error handling
- configuration management

Evidence:

Score:
`__/7`

---

## 7.2 Dependency Management

Dependencies reviewed?
- [ ] Yes
- [ ] Partial
- [ ] No

Outdated / abandoned packages:

High-risk dependencies:

License concerns:

Score:
`__/3`

---

# 8. SECURITY ASSESSMENT

Review:

| Control | Status | Evidence | Risk |
|---|---|---|---|
| Authentication | | | |
| Authorization | | | |
| Secret management | | | |
| Input validation | | | |
| Encryption in transit | | | |
| Encryption at rest | | | |
| Logging of sensitive data | | | |
| Dependency vulnerabilities | | | |
| Access control | | | |
| Production credential separation | | | |

Critical security findings:

Score:
`__/10`

---

# 9. TESTING & QUALITY

## 9.1 Test Coverage

Available:
- [ ] Unit tests
- [ ] Integration tests
- [ ] End-to-end tests
- [ ] Regression tests
- [ ] Performance tests
- [ ] Security tests
- [ ] Hardware / field tests if applicable

Evidence:

Known untested areas:

Score:
`__/8`

---

## 9.2 Build and Runtime Verification

Build:
- [ ] PASS
- [ ] FAIL
- [ ] NOT RUN

Lint:
- [ ] PASS
- [ ] FAIL
- [ ] NOT RUN

Unit Test:
- [ ] PASS
- [ ] FAIL
- [ ] NOT RUN

Integration Test:
- [ ] PASS
- [ ] FAIL
- [ ] NOT RUN

Runtime Test:
- [ ] PASS
- [ ] FAIL
- [ ] NOT RUN

Score:
`__/5`

---

# 10. DEVOPS & DEPLOYMENT

CI/CD available?
- [ ] Yes
- [ ] Partial
- [ ] No

Deployment documented?
- [ ] Yes
- [ ] Partial
- [ ] No

Rollback available?
- [ ] Yes
- [ ] Partial
- [ ] No

Environment separation?
- [ ] Yes
- [ ] Partial
- [ ] No

Backup / restore tested?
- [ ] Yes
- [ ] Partial
- [ ] No

Score:
`__/5`

---

# 11. OBSERVABILITY & OPERATIONS

Monitoring:

Logging:

Alerting:

Health checks:

Incident handling:

Troubleshooting documentation:

Score:
`__/5`

---

# 12. DOCUMENTATION

Available:
- [ ] README
- [ ] Project Context
- [ ] Requirements
- [ ] Architecture
- [ ] API Documentation
- [ ] Deployment Guide
- [ ] Troubleshooting
- [ ] Change Log
- [ ] Decision Log
- [ ] User Manual
- [ ] Operational Manual

Score:
`__/5`

---

# 13. TECHNICAL DEBT

Known technical debt:

1.
2.
3.

Severity:
- [ ] Low
- [ ] Medium
- [ ] High
- [ ] Critical

Recommended treatment:

---

# 14. RISK REGISTER

| ID | Risk | Probability | Impact | Severity | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R-001 | | | | | | |
| R-002 | | | | | | |
| R-003 | | | | | | |

---

# 15. SCORING SUMMARY

| Area | Max Score | Actual |
|---|---:|---:|
| Business & Scope | 15 | |
| Requirements | 15 | |
| Architecture | 17 | |
| Implementation | 10 | |
| Security | 10 | |
| Testing & Quality | 13 | |
| DevOps & Deployment | 5 | |
| Operations | 5 | |
| Documentation | 5 | |
| Technical Readiness Adjustment | 5 | |
| **TOTAL** | **100** | |

Recommended interpretation:

- 90–100 = READY
- 75–89 = READY WITH CONDITIONS
- 60–74 = PARTIALLY READY
- 40–59 = NOT READY
- <40 = MAJOR REDESIGN / HIGH RISK

Scoring does not override critical blockers.

---

# 16. BLOCKERS

## Critical

1.
2.

## High

1.
2.

## Medium

1.
2.

---

# 17. PRIORITIZED ACTION PLAN

## P0 — Immediate

1.
2.
3.

## P1 — Before Next Gate

1.
2.
3.

## P2 — Improvement

1.
2.
3.

---

# 18. FINAL DECISION

Decision:
- [ ] CONTINUE
- [ ] CONTINUE WITH CONDITIONS
- [ ] HOLD
- [ ] REDESIGN
- [ ] STOP

Reason:

Conditions:

Next Gate:

Required Evidence Before Next Gate:

1.
2.
3.
