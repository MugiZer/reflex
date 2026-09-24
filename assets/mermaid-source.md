# Root demo — Mermaid source

See README.md for reveal order, explanations, and implementation notes.

## 1. Match the right healthy execution

```mermaid
flowchart LR
    R["Regressed<br/>execution"]:::bad --> M{"Context<br/>match"}
    H1["Healthy run A"] --> M
    H2["Healthy run B"] --> M
    H3["Healthy run C"] --> M
    M -->|Compatible| B["Matched healthy<br/>baseline"]:::good
    M -.->|Incompatible| X["Excluded"]:::muted
    classDef bad fill:#422b2e,stroke:#ed927e,color:#ffffff
    classDef good fill:#183e3a,stroke:#80d5bd,color:#ffffff
    classDef muted fill:#20262a,stroke:#65717b,color:#a7b2ba,stroke-dasharray:5 5
```
## 2. Reconstruct where the work went

```mermaid
flowchart LR
    H["CPU / host<br/>work"] --> C["CUDA runtime<br/>launch"]
    C -->|Enqueue / correlation ID| K["GPU kernels"]:::good
    T["Transfer"] -->|Data dependency| K
    K --> S["Synchronization"]
    S -->|Unblocks| N["Host<br/>continues"]
    classDef good fill:#183e3a,stroke:#80d5bd,color:#ffffff
```

## 3. Combine evidence. Rank possible causes.

```mermaid
flowchart LR
    T["Matched timing<br/>evidence"] --> D["Combined<br/>diagnosis"]:::good
    G["Execution / dependency<br/>evidence"] --> D
    A["Statistical / ML<br/>attribution"] --> D
    D --> R["Ranked possible causes<br/>GPU · scheduler · CPU · queue"]
    classDef good fill:#183e3a,stroke:#80d5bd,color:#ffffff
```

## 4. Choose the next useful measurement

```mermaid
flowchart LR
    H["Remaining hypotheses<br/>CPU · scheduler · GPU"] --> S["Expected information gain<br/>/ effective cost"]:::good
    A["Scheduler trace"] --> S
    B["Kernel timeline"] --> S
    C["GPU counters"] --> S
    S --> M["Collect one<br/>selected measurement"]:::good
    M -->|New evidence| U["Updated<br/>hypotheses"]
    classDef good fill:#183e3a,stroke:#80d5bd,color:#ffffff
```

## 5. Test the explanation

```mermaid
flowchart LR
    H["Suspected<br/>cause"] --> P["Predict<br/>mechanism change"]
    P --> I["Targeted<br/>intervention"]
    I --> R["Controlled<br/>rerun"]
    R --> M{"Mechanism<br/>changed?"}
    M -->|Yes| L{"Latency<br/>recovered?"}
    L -->|Yes| V["VERIFIED"]:::good
    M -.->|No| T["TESTED<br/>Keep investigating"]:::muted
    L -.->|No| T
    classDef good fill:#183e3a,stroke:#80d5bd,color:#ffffff
    classDef muted fill:#20262a,stroke:#65717b,color:#a7b2ba
```

## 6. SmolVLA on NVIDIA T4

```mermaid
flowchart LR
    H1["Healthy median<br/>3.94 ms"]:::good -->|+152%| R1["Regressed median<br/>9.94 ms"]:::bad
    H2["Healthy p95<br/>7.07 ms"]:::good -->|+230%| R2["Regressed p95<br/>23.3 ms"]:::bad
    H3["Matched GPU anomaly · control<br/>0.39"]:::good --- R3["Matched GPU anomaly · regression<br/>4.11"]:::bad
    classDef good fill:#183e3a,stroke:#80d5bd,color:#ffffff
    classDef bad fill:#422b2e,stroke:#ed927e,color:#ffffff
```
