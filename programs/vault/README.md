# programs/vault

Anchor program `flipside_vault`. Scaffold only in P0; the full program (section 5 of CLAUDE.md) is P3.

```bash
cargo check -p flipside_vault     # host check, no Solana toolchain needed
anchor build                      # needs the Solana and Anchor CLIs (P3)
```

The program ID in `Anchor.toml` and `declare_id!` is a placeholder until P3 generates the real
program keypair. Upgrade authority will be a Squads v4 multisig behind a 72-hour timelock.
