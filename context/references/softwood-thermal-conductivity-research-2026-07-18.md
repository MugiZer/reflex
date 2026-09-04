# Softwood thermal conductivity in design practice

## Finding

Architects and energy modellers normally do **not** obtain a separately measured thermal conductivity for every timber stud. They use either:

- a manufacturer-declared design value for a specified engineered or proprietary wood product; or
- a code/standard tabulated design value for ordinary structural timber, with its assumptions made explicit.

This is a controlled design assumption, not an arbitrary shortcut. ISO 10456 defines procedures for declared, measured, and tabulated design thermal values and for converting them to design conditions. [ISO 10456:2007](https://www.iso.org/cms/live/live/en/sites/isoorg/contents/data/standard/04/09/40966.html?browse=tc)

## What 0.13 W/(m·K) means

`0.13 W/(m·K)` is a conventional tabulated value for wood around 500 kg/m³, rather than a property uniquely determined by the word “softwood”. A current LVL handbook explicitly cites EN ISO 10456's 0.13 W/(m·K) design value at 500 kg/m³ and 20 °C/65% RH. [LVL Handbook Europe](https://proofer.faktor.fi/epaper/LVLHandbook_2025/178/)

The Canadian Wood Council's building-science material similarly presents wood at roughly 0.13 W/(m·K), while noting an NBC figure of 0.12. [Canadian Wood Council handout](https://cwc.ca/wp-content/uploads/2025/08/Handout-10.pdf)

## Why a generic material name is insufficient for an exact value

Wood conductivity varies with species, density, moisture content, and direction relative to grain. The USDA Forest Products Laboratory's Wood Handbook treats wood properties as moisture-dependent and tabulates some properties by species. [USDA Wood Handbook, Chapter 4](https://research.fs.usda.gov/treesearch/62243)

The American Wood Council reports a range, not a single universal number, for structural softwood lumber at 12% moisture content and points to species-specific USDA data. [American Wood Council](https://awc.org/faq/what-is-the-thermal-conductivity-of-wood-and-how-does-it-compare-to-other-materials/)

## Product implication

For the IFC label `LMA_Montant bois porteuse`, the application can safely make a deterministic **library match** to Softwood because its material library explicitly maps that label to the Softwood entry. It should:

1. Auto-fill 0.13 W/(m·K) when the user chooses default/library values.
2. Preserve `material_library` provenance and label it as a tabulated/default assumption.
3. Allow an override when the specification identifies a different species, density, moisture condition, treatment, or engineered product.
4. Never present the value as IFC-extracted unless the IFC actually contains a declared thermal property.
