# Architectural practice and appropriate verifier precision

Research date: 2026-07-18
Scope: Canadian/Ontario practice, applicable as a general model for building-envelope verification.

## What architects actually do

Architects lead the assembly of a buildable design: they develop drawings and specifications, coordinate engineering and specialist consultant documents, resolve code and constructability issues, and administer the construction contract. The work moves from broad design choices to precise contract requirements; it is not a one-time exercise in entering every physical property by hand.

- In early design, teams compare options and make assumptions quickly. The Ontario Association of Architects (OAA) describes energy modelling as a design tool: the value is in testing options and assumptions early, then estimating, measuring, and verifying performance against targets.
- In design development and construction documents, the architect selects and assembles envelope components, designs for thermal resistance, moisture control, and airtightness, and coordinates drawings with specifications and consultants.
- On complex or high-performance work, an energy modeller and/or building-envelope consultant commonly supports the architect. RAIC lists both energy-modelling and building-science consulting as project services; they are not implicitly included in every architect's scope.
- During procurement and construction, precision is created through product data, submittals/shop drawings, specifications, mock-ups, inspection, and testing. For example, OAA air-barrier guidance calls for the designer and envelope consultant to review plans and specifications before issue, and for trades to declare the materials they intend to use.

## The precision model a professional verifier should use

The tool should not force an architect to know an exact conductivity for every generic IFC layer at the start. That produces false friction, not professional rigour. Require precision in proportion to the project stage and the decision risk.

| Evidence level | Appropriate use | Inputs accepted | Result label |
| --- | --- | --- | --- |
| Design estimate | Early option comparison, BIM intake | Deterministic library default mapped from a generic material/assembly | Assumed / preliminary |
| Coordinated design | Design development, consultant review | Standard design value or consultant-approved assembly | Coordinated |
| Compliance verification | Permit, procurement, final record | Identified product data, declared/design value conditions, applicable standard and junction treatment | Verified for stated scope |

### Product decision for this app

1. Automatically apply a standard library value for an unambiguous generic material such as a softwood stud. Do not block the calculation.
2. Record the exact mapping, source/table, value, units, conditions, standard/version, and whether it is a default or product-backed value.
3. Mark the result **assumed**, not verified, until the assembly/product evidence is supplied or approved.
4. Escalate only material ambiguity or material impact: insulation type/thickness, foam products, membranes, engineered wood, moisture-sensitive values, thermal bridges, or substitutions should request a selection or evidence.
5. For a permit-grade result, require the location/code path and the appropriate consultant/product evidence. Do not imply that importing IFC alone verifies compliance.

## Why this is the right bar

The professional advantage is traceability and a clear confidence boundary, not pretending a generic BIM name carries manufacturer-grade precision. ISO 6946 bases U-value work on appropriate design thermal conductivities/resistances; ISO 10456 distinguishes declared and design values and provides conversions for temperature and moisture. A generic material can support a fast, defensible estimate, but a product-specific compliance claim needs product-specific evidence and the relevant boundary/junction assumptions.

## Sources

- [OAA: Every Architect Needs to Know About Energy Modeling](https://oaa.on.ca/Assets/Common/Shared_Documents/Practice%20Tips/PT.36.1_V01.1_EveryArchitectNeedsToKnowAbout-EnergyModeling_20160831.pdf)
- [OAA: construction-document envelope competency](https://secure.oaa.on.ca/OAA/KOPC/SA/KC06_CD.aspx)
- [OAA/CMHC: Guidelines for Delivering Effective Air Barrier Systems](https://oaa.on.ca/Assets/Common/Shared_Documents/OAAAS/05/5.%20Guidelines-for-Delivering-Effective-Air-Barrier-Systems.pdf)
- [RAIC: Architect's Scope of Services](https://raic.org/resource/architects-scope-of-services/)
- [RAIC: Guide to appropriate architectural fees and scope](https://raic.org/resource/a-guide-to-determining-appropriate-fees-for-the-services-of-an-architect/)
- [ISO 6946: Building components and building elements — Thermal resistance and thermal transmittance](https://www.iso.org/standard/65708.html)
- [ISO 10456: Hygrothermal properties — Tabulated design values and procedures](https://www.iso.org/standard/40966.html)
