# Contributing

Use synthetic data only in commits, tests, issues, and pull requests. Generated profiles and skills may include verbatim personal messages, even if raw exports were omitted.

For a new importer, document the official export route, exact supported layouts, sender ownership, timestamp interpretation, context availability, and limitations. Add tests for representative records and at least one failure case. Run `bun test`, `bun run check`, and `bun run demo`.

Keep the initial user review inexpensive. New automated judges must establish what they measure and demonstrate calibration before becoming acceptance gates. Model calls should be explicit, incremental, resumable, and tied to frozen inputs.
