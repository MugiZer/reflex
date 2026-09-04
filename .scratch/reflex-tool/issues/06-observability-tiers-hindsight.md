# Decide always-on tiers, hindsight buffering, and observer-cost calibration

Status: open
Type: grilling
Blocked by: 04

## Question

What is the minimal always-on telemetry set, the bounded nonblocking hindsight ring-buffer design with pre/post-trigger preservation and drop accounting, the triggered vs deep-escalation tiers, and the observer-effect calibration protocol (paired on/off runs, sampling-rate sweeps, per-context cost + uncertainty) that keeps the fast loop unperturbed while feeding the measurement selector a real cost model?
