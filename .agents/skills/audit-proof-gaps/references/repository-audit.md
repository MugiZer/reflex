# Repository audit branch

Use this branch to turn a broad hunt into one bounded delivery audit.

## 1. Inventory at low resolution

Read architecture indexes, the repository graph or wiki, composition roots, and prior incident/backlog records. List externally meaningful or durable boundaries without opening their implementation files or running the full suite.

## 2. Rank and freeze

Rank boundaries by:

1. risk to source-of-truth or protected state;
2. external, persistent, process, or language crossing;
3. repeated prior failures;
4. distance between the claim and its strongest recorded proof.

Select the highest-risk boundary. Freeze the pass to that boundary and one shared-boundary hop required by its tracer claim.

## 3. Audit one boundary

Return to the main skill at **Select the tracer**. Open source and run focused proof only along the frozen route. Place every discovery outside it in the queue.

## 4. Report the queue

Name each unaudited boundary and the evidence that put it in the inventory. Mark it `QUEUED`, not healthy or defective.

**Completion criterion:** exactly one boundary has an audit decision, every other inventoried boundary is visibly queued, and no repo-wide `GO` is claimed.
