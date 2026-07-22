# Building Component Knowledge Sources

Date: 2026-07-21

## Conclusion

There is no single authoritative, reusable database that can tell a BIM-to-thermal compiler both **what every building component is** and **how it participates in heat flow**.

The system should combine four separately versioned authority layers:

1. **IFC evidence** describes the BIM object, layer/constituent/profile structure, geometry, properties, classifications, and external references.
2. **bSDD and other classifications** provide stable identifiers, definitions, aliases/translations, property definitions, and relationships.
3. **Calculation standards and codes** determine the physical treatment: homogeneous serial layer, air cavity, repeating framing, fastener correction, or 2-D/3-D thermal bridge.
4. **Product evidence** supplies declared/tested properties for an identified product and its stated conditions of use.

These layers must not be collapsed into one material-name-to-lambda table. Classification can establish identity or physical role without making a calculation eligible.

## Source map

| Source | What it can authoritatively provide | Machine-readable? | What it cannot safely provide by itself |
|---|---|---:|---|
| IFC 4.3 | BIM element/material structure, ordered layers and thickness, ventilation flag, property containers, classification/library links | Yes: EXPRESS, XSD, OWL and IFC instances | A complete construction-product catalog or the correct thermal model for every assembly |
| bSDD | Versioned dictionaries of classes, properties, units, allowed values, translations, and links to IFC/other dictionaries | Yes: REST/OpenAPI, GraphQL, JSON/templates | Verified thermal values or calculation eligibility unless a particular governed dictionary explicitly supplies them |
| ISO 10456 | Declared/design values and conversion procedures for thermally homogeneous materials/products | Standard is not an open data API | Assembly topology and metal-bridge calculation |
| ISO 6946 | Resistance/transmittance methods for homogeneous layers, air layers, some inhomogeneous layers, and a limited fastener correction | No public machine-readable normative dataset | General cases where insulation is bridged by metal |
| ISO 10211 | 2-D/3-D numerical treatment of thermal bridges; linear and point transmittance | No public machine-readable normative dataset | Component identity or product property discovery |
| NBC/NRC | Canadian effective-RSI rules, generic material/air-cavity values, steel-frame treatment, and code applicability | Mostly documents/HTML, not a stable normative data API | Universal product identity; bulk commercial reuse without checking rights |
| CCMC Registry | Current Canadian product-assessment identity, status, standards, classifications, and some assessment-specific performance evidence | Yes for registry metadata via JSON API; detailed evidence is also HTML/PDF | A normalized thermal-property database covering all products |
| Manufacturer DoP/technical data | Product-specific declared performance, intended use, test standard, thickness/density and sometimes conductivity/resistance | Commonly PDF; no universal API | Generic family defaults or cross-product comparability without checking declared conditions |
| EPD systems | Verified environmental declarations and product identity; sometimes technical characteristics | Some: ILCD+EPD XML/JSON APIs | Thermal design values in general; EPDs principally describe environmental performance |

## 1. IFC: the interchange and evidence backbone

The official IFC material resource distinguishes a single material, ordered layer sets, profiles, and unordered constituent sets, and supports material properties, classifications, and library references. This is the correct first source for what the authoring model actually asserts, not a catalog to be replaced by name matching ([IFC Material Resource](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/ifcmaterialresource/content.html)).

Important structures for the knowledge system:

- `IfcMaterialLayer` carries material identity, thickness, name/category and `IsVentilated`. The specification explicitly distinguishes an unspecified material from an air gap; `IsVentilated` is the relevant air-exchange evidence ([IfcMaterialLayer](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcMaterialLayer.htm)).
- `IfcMaterialProperties` can attach named, valued and unit-bearing properties to a material, constituent/set, layer/set, or profile/set ([IfcMaterialProperties](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcMaterialProperties.htm)).
- `Pset_MaterialThermal` standardizes `ThermalConductivity` and `SpecificHeatCapacity` as material properties ([Pset_MaterialThermal](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_MaterialThermal.htm)).
- `IfcClassification` and `IfcClassificationReference` support either a full hierarchy or a lightweight reference with stable identification and an optional URI into the external classification ([IfcClassification](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcClassification.htm), [IfcClassificationReference](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcClassificationReference.htm)).

Implementation implication: preserve the IFC schema/release, entity GUID, material/layer identity, property path, units, and external-reference URI as provenance. A custom IFC name is evidence, not a canonical identifier and not a thermal value.

Licensing: the IFC 4.3 documentation states that IFC is published under **CC BY-ND 4.0**. Reference stable identifiers/URIs and preserve attribution; obtain legal review before bundling or adapting substantial parts of the schema/documentation ([IFC license notice](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_MaterialThermal.htm)).

## 2. bSDD: the extensible terminology layer

buildingSMART describes bSDD as a canonical service hosting classifications, properties, allowed values, units and translations. Its API is the intended integration route, with REST/OpenAPI and GraphQL access ([official bSDD repository](https://github.com/buildingSMART/bSDD), [bSDD API documentation](https://github.com/buildingSMART/bSDD/blob/master/Documentation/bSDD%20API.md)).

The official IFC/bSDD policy makes the intended boundary especially useful for this project: IFC contains internationally agreed foundations, while national, project-specific and company-specific specializations/property definitions can live in bSDD and remain linked to their IFC parent. The policy describes JSON, ISO 12006-3-style static data, and Linked Data publication routes ([buildingSMART IFC-bSDD policy](https://www.buildingsmart.org/wp-content/uploads/2021/03/20200227_IFC-bSDD_Policy-Statement.pdf)).

Use bSDD for:

- canonical component/material family identifiers;
- French/English and project aliases;
- property definitions, units and allowed values;
- relationships to IFC entities and other classifications;
- project/company extensions without changing compiler code.

Do **not** treat every bSDD class/property as trusted calculation data. Each dictionary has its own owner and governance. The bSDD policy says domain owners control updates and may publish data under a license; the MIT license on the GitHub repository covers that repository's software/documentation, not automatically every hosted dictionary dataset ([bSDD repository license](https://github.com/buildingSMART/bSDD/blob/master/LICENSE), [IFC-bSDD policy](https://www.buildingsmart.org/wp-content/uploads/2021/03/20200227_IFC-bSDD_Policy-Statement.pdf)).

The API is regularly updated; buildingSMART says breaking versions are supported in parallel for six months. Production ingestion should therefore pin the API contract and store dictionary URI/version plus a content snapshot/hash rather than resolve live bSDD data during a calculation ([bSDD API documentation](https://github.com/buildingSMART/bSDD/blob/master/Documentation/bSDD%20API.md)).

## 3. Physical-treatment standards

These sources select or constrain a calculation model; they are not material catalogs.

### ISO 10456

ISO 10456:2007 specifies procedures for determining declared and design thermal values for thermally homogeneous materials/products, including conversion for temperature and moisture, and includes tabulated design data for common homogeneous materials. ISO lists this edition as current but under revision ([ISO 10456:2007](https://www.iso.org/standard/40966.html)).

Use it to govern `declared value -> design value` and applicability conditions. Do not use it to flatten cavities, studs, girts or fasteners into homogeneous lambda layers.

### ISO 6946

ISO 6946:2017 covers thermal resistance/transmittance for homogeneous layers (including air layers) and an approximate method for some inhomogeneous layers and metal fasteners. ISO explicitly says other cases where insulation is bridged by metal are outside its scope ([ISO 6946:2017](https://www.iso.org/standard/65708.html)).

This is the primary treatment authority for ordinary serial layers, supported air layers, surface resistances and the standard's limited correction cases. A phrase such as `montant metallique` is therefore a role classification that normally requires assembly geometry, not permission to insert steel lambda serially.

### ISO 10211

ISO 10211:2017 specifies the 2-D and 3-D geometrical models, boundaries and thermal conditions for numerical thermal-bridge calculations and can derive linear and point thermal transmittances ([ISO 10211:2017](https://www.iso.org/standard/65710.html)).

Use it as the escalation treatment for bridges outside the simplified method: continuous metal framing/girts and geometry-dependent linear or point bridges.

Licensing: ISO's public pages provide scope and status, but the normative standards and their tables/formula details are copyrighted publications. Implement from lawfully acquired standards and record edition/corrigenda; do not copy normative tables or clause text into an openly redistributed knowledge pack without permission.

## 4. Canadian code and product evidence

The NRC's public material for NBC Section 9.36 is directly relevant to Barclay. It requires repetitive framing effects to be included, explains why simple parallel paths do not represent steel framing, provides a steel-frame approximation, and distinguishes air cavities by heat-flow direction. It also says manufacturer values may be used when obtained with referenced test methods and that materials outside a ventilated roof cavity do not contribute to effective resistance ([NRC proposed change 1657, including the Section 9.36 explanatory material](https://nrc.canada.ca/en/certifications-evaluations-standards/codes-canada/codes-development-process/public-review/2022/pcfs/nbc20_divb_09.36.02.04.%2801%29_001657.html)).

Use the enacted code edition applicable to the jurisdiction/project; the cited public-review page is valuable research evidence but is not itself proof that every proposed provision became law.

The **CCMC Registry of Product Assessments** is a practical Canadian product source. NRC calls it the official registry, advises checking current status/version, and exposes a documented JSON API. The API includes assessment number, organization, bilingual product names, standards/evaluation documents and MasterFormat classifications ([CCMC registry and JSON API schema](https://nrc.canada.ca/en/certifications-evaluations-standards/canadian-construction-materials-centre/ccmc-publications/registry/extranet/list.html?a=0&c=0&mf=0&mfg=0&o=0&s=0&t=0&tg=0&y=0), [about the CCMC registry](https://nrc.canada.ca/en/certifications-evaluations-standards/canadian-construction-materials-centre/about-ccmc-registry-product-assessments)). Individual assessments can contain tested thermal performance, but the JSON index is principally metadata; product facts still need evidence-level parsing and applicability checks ([example CCMC product assessment](https://www.nrc.canada.ca/en/certifications-evaluations-standards/canadian-construction-materials-centre/ccmc-publications/document.html?id=13430-L&type=cert)).

Licensing: NRC permits accurate non-commercial reproduction of Government of Canada works under stated conditions, but requires permission for commercial redistribution or adaptation unless the item has a separate open license. Some material incorporates third-party standards. A commercial embedded dataset should obtain permission or store identifiers, citations and user-supplied evidence rather than redistributing NRC tables ([NRC terms and conditions](https://nrc.canada.ca/en/corporate/transparency/terms-conditions)).

## 5. Product declarations and EPDs

A manufacturer technical data sheet or Declaration of Performance (DoP) is authoritative only for the identified product, intended use, harmonized specification/test method and declared conditions. The European Commission describes the DoP as the required product-performance declaration for products covered by a harmonized standard or European Technical Assessment, with the manufacturer responsible for conformity ([European Commission: Declaration of Performance and CE marking](https://single-market-economy.ec.europa.eu/sectors/construction/construction-products-regulation-cpr/declaration-performance-and-ce-marking_en)).

There is no universal current DoP API. Expect PDFs and manufacturer-hosted documents; ingest them as immutable evidence with manufacturer, product code, revision/date, declared property, unit, test standard, conditions, source URL and document hash. Never promote a family-level name match to a product-specific value.

EPDs are useful for product identity and environmental data, not a substitute for thermal declarations. ECO Platform describes digital EPDs in machine-readable ILCD+EPD XML, and the International EPD System offers downstream API data in ILCD+EPD format ([ECO Platform: digital EPDs](https://www.eco-platform.org/eco-epd-40.html), [International EPD System API](https://epd-environdec-app.azurewebsites.net/services/api)). Thermal characteristics may appear, but the value must still be validated against the applicable thermal test/declaration conditions.

EPD reuse is license-sensitive. ECO Portal requires registration/license for API use, keeps EPD data ownership with the EPD owner, and prohibits redistribution or creating a derived data product without permission; applications should link to the original data source ([ECO Portal terms](https://www.eco-platform.org/terms-conditions.html)). Treat each program operator's API and each manufacturer document as a separately licensed source.

## Recommended ingestion policy

Every knowledge record should carry:

```text
canonical_id
record_kind                 # identity | role | property | treatment | alias
source_authority
source_record_id_or_uri
source_edition_or_version
retrieved_at
content_hash
license_id_or_terms_uri
jurisdiction
applicability_conditions
evidence_grade
review_status
valid_from / valid_to
supersedes
```

Adopt the following precedence and safety rule:

```text
IFC asserted evidence
  -> exact governed identity/classification
  -> applicable product declaration or assessment
  -> applicable code/standard treatment
  -> generic design value only when the governing method permits it
  -> otherwise structured request/review; never guessed lambda
```

The local Barclay vocabulary should therefore be a removable **knowledge pack**, not application logic. It can add aliases such as `espacement air`, `montant metallique`, `fixation en Z`, and `barres Z`, map them to canonical roles and list required parameters. Calculation treatments remain in a smaller standards-backed kernel. Removing a pack removes its recognition rules without changing the physics engine; updating a standard produces a new version of the treatment pack and preserves reproducibility of previous reports.

## Practical first source set

1. Pin IFC 4.3 structures and standard material property paths.
2. Import selected bSDD dictionary snapshots only after recording dictionary owner, version and license.
3. Encode ISO 6946/10456/10211 treatments from licensed copies, with edition-specific conformance tests.
4. Add an NBC Canada treatment/value pack for the chosen enacted edition and jurisdiction after confirming reuse rights.
5. Integrate CCMC identifiers/status through its JSON API; keep performance evidence linked to the exact assessment version.
6. Accept manufacturer DoP/technical sheets as reviewed product evidence.
7. Use EPD APIs for identity/environmental enrichment, never as an automatic thermal-property authority.

