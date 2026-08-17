## Parent

#2

## What to build

Extend the controlled loopback OpenRouter proof so the production adapter's
negative HTTP contracts are exercised through a real HTTP request, without
adding retries, queues, or provider-failover behaviour.

## Acceptance criteria

- [ ] The loopback server proves rate-limit classification and retry-after parsing.
- [ ] The loopback server proves malformed structured output is classified as
  schema-invalid.
- [ ] The loopback server proves deadline timeout and caller cancellation reach
  the HTTP request and return their distinct neutral outcomes.
- [ ] The proof continues to show that authorization and private request content
  are not written to unsafe diagnostics.

## Verification

- **Proof:** focused provider-conformance test uses the controlled HTTP server
  for every listed response/failure case; each assertion can fail if the
  request mapping or classification changes.
- **Affected regression:** agent-provider seam tests and type checking.

## Blocked by

None — can start immediately.
