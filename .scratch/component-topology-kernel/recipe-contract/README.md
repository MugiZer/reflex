# Recipe contract fixtures

`recipe.schema.json` is the draft structural schema.  `primitive-registry.json`
is a registry fixture; a real registry additionally carries a parameter schema
and compiler for each registration.  `valid-*.json` fixtures are structural and
semantic examples. `invalid-*.json` records the expected diagnostic category;
some are structurally valid by design because registry/compiler validation is
where the rejection belongs.

All valid fixtures use the same module and generic placement vocabulary.  The
only member variation is the registered primitive kind and its local parameter
map, which demonstrates that construction family names do not enter the kernel.
