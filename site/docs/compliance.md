---
title: "Compliance and security"
summary: "Where the standard, the reference software, the documentation and this site stand against the regulations and frameworks that could apply to them, what the security design proves and what it does not, and what this site does and does not do with your data."
description: "Compliance crosswalk (EU AI Act, NIST AI RMF, GDPR, Cyber Resilience Act, TDM reservation, WCAG, OWASP LLM Top 10, SLSA) and security considerations of AgenticSystemCore, plus the site's own privacy and accessibility practice."
---

## The standing rule

The operator's standing rule for this project is that the standard, the reference software, the documentation and this site are developed and maintained with the intention of complying with the law of the jurisdictions in which they are used, with the NIST AI Risk Management Framework and the EU Artificial Intelligence Act as the reference frameworks, and that they are secure and safe by design. The crosswalk and the security considerations below are the current evidence for that rule. They are reviewed at every release, and they are not legal advice: a publisher who deploys the format, and the operator of this site, remain responsible for their own legal review.

## What this site does

- **No personal data collected by this site.** No cookies, no analytics, no forms, no third-party requests, no script other than the same-origin search script, which sends nothing anywhere (AGSC-06-05). Cloudflare, which serves the site, processes the technical data of each request under its own policy; the operator keeps no logs. Details are on the [legal page](/legal/#privacy).
- **Accessibility.** Every page is checked against WCAG 2.2 AA with automated tooling in both colour schemes before it is published (AGSC-06-20); every diagram carries a text description and a caption.
- **AI assistance is disclosed.** Every item on this site carries a provenance record. The vocabulary and guide items were written with AI assistance and reviewed and published by the operator, and say so in their `prov` block (AGSC-08-01); the specification's own documents record the models that drafted them.
- **Content signals.** One licence policy is stated in three machine-readable ways: the AI-usage signals in `robots.txt`, the TDM reservation at `/.well-known/tdmrep.json`, and the licence members of the graph together with the provenance header of `llms.txt` (AGSC-06-18).
- **Security reports.** `/.well-known/security.txt` (RFC 9116) says where to report a vulnerability.

## Compliance crosswalk

{{crosswalk}}

## Security considerations

{{security}}
