# Ubakus and a professional-grade IFC thermal verifier

## What Ubakus does

Ubakus is an assembly calculator. Its editor lets the user enter a construction layer by layer, select from more than 3,000 materials/manufacturers, enter layer thickness, framing geometry, lambda, vapour resistance, density and heat capacity, then calculate U-value, moisture and related results. [Ubakus calculator](https://www.ubakus.de/u-wert-rechner/)

Its commercial workflow advertises calculations to DIN 6946 for U-value, DIN 4108-3 for moisture protection and DIN 68800-2 for drying reserve. [Ubakus calculator](https://www.ubakus.de/u-wert-rechner/)

Ubakus also states an important limitation: its supplied material values are generally averages and can deviate by more than 10% in an individual case. Therefore, it is a useful modelling and decision tool, but its material selection alone is not a product-specific verification record. [Ubakus calculator](https://www.ubakus.de/u-wert-rechner/)

## What is professionally defensible

The calculation method should be standards-led:

- **ISO 6946** for one-dimensional component U-values and its approximate treatment of inhomogeneous layers / certain fasteners. It requires appropriate *design* thermal conductivities or resistances for the application. [ISO 6946:2017](https://www.iso.org/standard/65708.html)
- **ISO 10456** for converting declared/measured values to design values and for tabulated values where product-specific evidence is absent. [ISO 10456:2007](https://www.iso.org/standard/40966.html)
- **ISO 10211** for detailed 2D/3D thermal-bridge calculations where a 1D/parallel-path model is insufficient. [ISO 10211:2017](https://www.iso.org/standard/65710.html)

For ordinary timber, a standards/library default can be legitimate. Canadian Wood Council material presents wood at about `0.13 W/(m·K)` and notes an NBC figure of `0.12`; the same source warns that test scenarios and published values differ. [CWC Building Science for Wood Buildings](https://cwc.ca/wp-content/uploads/2025/08/Handout-10.pdf)

## Recommended product model

Do not copy Ubakus's broad material database model as the authority. Use a four-level evidence hierarchy:

1. **Product evidence** — manufacturer technical data / declaration, product identifier, document version and tested/declared lambda.
2. **Standards value** — jurisdictional code or standards table, with density, moisture and use-condition assumptions.
3. **Curated generic library** — deterministic mapping from a specific IFC material name to a reviewed generic material; explicitly labelled as an assumption.
4. **Unresolved** — no compatible evidence; require a user decision.

Each resolved lambda should retain its source document or table, conditions, version, resolver rule and confidence. The report should show that provenance next to the calculated U-value.

## Implication for `LMA_Montant bois porteuse`

The current deterministic mapping to Softwood `0.13 W/(m·K)` is appropriate as **level 3**, because the IFC label is a strong alias for a conventional timber stud. It should auto-fill when the user selects library defaults, but remain visibly tagged as `material_library`, not `ifc_extracted`.

For a professional-grade result, upgrade it to level 2 when the project jurisdiction confirms the relevant tabulated value; upgrade it to level 1 when the project identifies a specific engineered/product timber with a declared value. Use 2D/3D bridge analysis for details that the 1D assembly model cannot represent.
