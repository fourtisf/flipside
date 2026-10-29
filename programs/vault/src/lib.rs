//! coinside_vault (CLAUDE.md section 5). Holds all user and pool SOL. It never knows about positions:
//! only deposits, engine co-signed withdrawals and balance roots.
//!
//! P0 is the scaffold. P3 adds the Config, Vault, UserState and BalanceRoot accounts and the
//! initialize, deposit, withdraw, post_root, emergency_withdraw and queue_change / execute_change
//! instructions, with bankrun tests and a Trident fuzz harness.

use anchor_lang::prelude::*;

declare_id!("PWYZvNnHu2QuGRXV8MCrfwN9fFz952xx76vnZD2NobR");

#[program]
pub mod coinside_vault {
    use super::*;

    /// Placeholder so the program builds and deploys; replaced by the real initialize in P3.
    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
