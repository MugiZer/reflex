# Development Thermal Treatment Reference Adapters

These adapters are development and test fixtures, not architect-facing supported Thermal Families. They deliberately use different matching evidence, confirmed inputs, validation rules, and analysis-model topology to keep the family seam honest.

To add a real family, implement `ThermalTreatmentFamily`, compose it into a `ThermalTreatmentFamilyRegistry`, and keep family-specific evidence translation, input validation, and analysis-model construction in that adapter. Do not edit the generic runner, persistence workflow, report renderer, or worker-result handling merely to register a family.