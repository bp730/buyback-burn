# Buyback & Burn Bot (Robinhood Chain)

Swaps accumulated USDG rewards into your token via Uniswap v2, then burns
the tokens received. Runs on a repeating timer (default every 5 minutes).

## How it works

1. **Every N minutes**, check the buyback wallet's USDG balance.
2. If it's above `MIN_USDG_BALANCE`, get a quote from the Uniswap v2
   Router's `getAmountsOut`, apply your `MAX_SLIPPAGE_BPS` tolerance,
   approve the router if needed, and swap all USDG → TOKEN via
   `swapExactTokensForTokensSupportingFeeOnTransferTokens` (direct
   USDG→TOKEN path). This variant is required because TOKEN charges a
   transfer fee — the standard `swapExactTokensForTokens` would revert.
3. Measure how many TOKEN were actually received (balance delta) — this
   naturally accounts for TOKEN's transfer fee, since we check the real
   balance change rather than trusting a returned amount.
4. Burn them — either by transferring to the dead address
   (`0x000...dEaD`, works for any ERC20) or by calling `TOKEN.burn(amount)`
   if your token contract supports it (`BURN_METHOD=burnFunction`).

## Setup

```bash
npm install
cp .env.example .env
# edit .env: fill in PRIVATE_KEY, USDG_ADDRESS, TOKEN_ADDRESS,
# UNISWAP_V3_ROUTER_ADDRESS, UNISWAP_V3_QUOTER_ADDRESS
```

You still need to fill in, per Robinhood Chain's actual deployment:
- `UNISWAP_V2_ROUTER_ADDRESS` — pull this from Uniswap's official deployment
  addresses list for Robinhood Chain, or look it up on the Blockscout
  explorer.
- `USDG_ADDRESS` — the native USDG stablecoin contract address.
- Confirm a USDG/TOKEN pair pool actually exists and has liquidity on
  Uniswap v2 for this chain — `getAmountsOut` will revert with no pool.
- **If USDG itself also charges a transfer fee** (unlikely for a
  stablecoin, but worth confirming), the router will receive less than
  `amountIn` and your quote will be optimistic. If that's the case, let me
  know and I'll switch the quote step to measure the pair's actual
  received balance instead of trusting `getAmountsOut`.

Run a dry run first (default `DRY_RUN=true`) to see quotes and logs without
sending any transactions:

```bash
npm run dev          # continuous, every INTERVAL_MINUTES
npm run run-once     # single cycle then exit — good for cron/testing
```

Once you're confident, set `DRY_RUN=false` in `.env`.

## Key security

This script signs with a raw private key loaded from an env var, which is
fine for testing but is a real liability for a wallet that will hold
continuous reward inflows in production. Before going live, consider:

- **A dedicated hot wallet with a low, capped USDG balance** — since rewards
  flow in continuously, you don't need to keep large reserves here; sweep
  anything beyond a buffer to cold storage periodically.
- **A KMS-backed signer** (AWS KMS, GCP KMS, or a service like Fireblocks/
  Turnkey) instead of a plaintext key in `.env`.
- **Running the process on infra you control** with the `.env` file
  permissioned to the running user only (`chmod 600 .env`), never committed
  to git (already covered by a `.gitignore` — add one if you haven't).
- **Alerting** on failed cycles (the `logger.error` calls) so a stuck
  approval or reverted swap doesn't silently stop your burns.

## Fee-on-transfer token behavior

TOKEN charges a fee on **buy/sell** (i.e. swaps through the Uniswap pair)
but has transfer fee set to **zero** for regular wallet-to-wallet transfers.
That means:

- The **swap** step (USDG→TOKEN) counts as a buy and is subject to buy fee.
  `swap.ts` uses `swapExactTokensForTokensSupportingFeeOnTransferTokens`
  and `cycle.ts` measures the real amount received via balance delta, so
  the buy fee is correctly accounted for.
- The **burn** step (TOKEN→dead address) is a plain transfer, not a pair
  interaction, so at 0% transfer fee the dead address receives the full
  amount — no shortfall, no changes needed in `burn.ts`.

If you ever change the transfer fee off zero, or exclude/un-exclude the
dead address from fees, revisit `burn.ts` — it would need to measure the
dead address's balance before/after (the same pattern already used for
the swap) to log the true burned amount instead of the pre-fee amount.

Also confirm `UNISWAP_V2_ROUTER_ADDRESS` matches the same router your
token contract's own `swapRouter` is configured to use internally
(visible in your `_swapCollectedDividends` logic) — using a different
router risks pointing at a different or non-existent pool.

## Reserve protection

If this wallet also holds tokens that must **never** be burnt (e.g. a
permanent 2% team/treasury reserve sitting in the same wallet as the
buyback funds), set `RESERVE_TOKEN_BALANCE` in `.env` to that amount.

Two independent safeguards enforce it, so a single bad number can't burn
into the reserve:

1. **Pre-cycle check** — if the wallet's TOKEN balance is already below
   the reserve floor before a cycle even starts, the cycle refuses to run
   and logs an error. This catches the case where the reserve itself was
   somehow already compromised, or an RPC read is returning garbage.
2. **Sanity bound on the swap result** — `received` (the balance delta
   after swapping) is compared against the original quote. If it's more
   than `MAX_RECEIVED_VS_QUOTE_MULTIPLIER`x the quote, the cycle aborts
   without burning. This is the key defense against the scenario where a
   stale/lagging RPC node returns `0` for the pre-swap balance — without
   this check, the resulting balance delta would look like it includes
   the entire reserve, and the bot would burn it.
3. **Hard floor on the burn amount** — even after passing both checks
   above, the actual amount sent to `burnTokens()` is capped so the
   wallet's post-burn TOKEN balance can never go below the reserve floor.
   This is the last line of defense regardless of what caused any of the
   numbers above to be wrong.

If any of these trip, the cycle logs an `ERROR` and skips the burn for
that tick rather than guessing — make sure you have alerting on error
logs in production so these get a human's attention promptly.

**Even stronger option:** if it's feasible for your setup, keeping the 2%
reserve in a *separate* wallet from the buyback/burn wallet removes this
risk entirely — the burn wallet would then only ever hold newly-swapped
tokens, so there's nothing sensitive for a bad read to endanger. The
safeguards above exist specifically for the case where that's not
practical and both balances have to share one wallet.

## Notes on scheduling in production

`setInterval` inside a long-running Node process (as wired in `index.ts`)
works, but if you want cron-style reliability (auto-restart on crash,
survives redeploys) run `npm run run-once` from an actual cron job or a
process manager (PM2, systemd timer, or a serverless scheduled function)
instead of relying on the built-in timer.

## Files

| File | Purpose |
|---|---|
| `src/config.ts` | Loads and validates env vars |
| `src/clients.ts` | viem public/wallet clients for Robinhood Chain |
| `src/abis.ts` | Minimal ERC20 + Uniswap v2 Router ABI |
| `src/swap.ts` | Quote, approve, and execute the USDG→TOKEN swap |
| `src/burn.ts` | Burn via dead-address transfer or `burn()` call |
| `src/cycle.ts` | Orchestrates one full check→swap→burn cycle |
| `src/index.ts` | Entry point: `--once` mode or repeating timer |