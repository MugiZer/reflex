# 01 — Auto-resolve recognized materials before Review

**What to build:** An IFC layer with a uniquely recognized Material Library name becomes calculation-ready without a lambda Requested Input. The calculation, Architect Action View, revision, and Report identify the value as library-assisted and retain the raw IFC material name plus its library source. A user can still replace that value with a material-library or manual override.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Recognized layer names no longer create a mandatory lambda Review question.
- [ ] Calculated results visibly distinguish library-assisted assumptions from IFC/product-backed values.
- [ ] An override supersedes the assumption without mutating IFC Evidence.
