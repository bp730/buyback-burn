# Buyback & Burn Bot (Robinhood Chain)

Swaps accumulated USDG rewards into your token via Uniswap v3, then burns
the tokens received. Runs on a repeating timer (default every 5 minutes).

## How it works

1. **Every N minutes**, check the buyback wallet's USDG balance.
2. If it's above `MIN_USDG_BALANCE`, get a quote from Uniswap's QuoterV2,
   apply your `MAX_SLIPPAGE_BPS` tolerance, approve the router if needed,
   and swap all USDG → TOKEN (`exactInputSingle`).
3. Measure how many TOKEN were actually received (balance delta).
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
- `UNISWAP_V3_ROUTER_ADDRESS` (SwapRouter02) and `UNISWAP_V3_QUOTER_ADDRESS`
  (QuoterV2) — pull these from Uniswap's official deployment addresses list
  for Robinhood Chain, or look them up on the Blockscout explorer.
- `USDG_ADDRESS` — the native USDG stablecoin contract address.
- The correct `UNISWAP_V3_POOL_FEE` tier for your USDG/TOKEN pool (500,
  3000, or 10000), i.e. whichever fee tier your pool actually has liquidity in.

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
| `src/abis.ts` | Minimal ERC20 + Uniswap v3 Router/Quoter ABIs |
| `src/swap.ts` | Quote, approve, and execute the USDG→TOKEN swap |
| `src/burn.ts` | Burn via dead-address transfer or `burn()` call |
| `src/cycle.ts` | Orchestrates one full check→swap→burn cycle |
| `src/index.ts` | Entry point: `--once` mode or repeating timer |
