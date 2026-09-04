# Decide the async runtime, 11-fault injection, and replay harness

Status: open
Type: grilling
Blocked by: 03

## Question

What is the design of the local real-timing asynchronous runtime (observation → action loop with monotonic clocks, bounded nonblocking buffers, async persistence), the hidden-ground-truth injection harness covering all 11 fault families from the doc, and the Retriever-style replay + FReD-style first-divergence support — so controlled experiments and verification run for real on the dev PC?
