# CamoSignal Weekly Trending Collections

Shopify app that automatically finds the top 2 trending collections from the
last 7 days of orders and writes them to shop metafields for the theme.

## What it does

- Reads orders from the last 7 days.
- Counts units sold for each product's collections.
- Skips utility collections: `all`, `best-seller`, `best-sellers`,
  `new-arrival`, `new-arrivals`, `graphictee`, `graphic-tee`,
  `independence-day`, `independence day`.
- Skips shipping protection style products.
- Writes the top 2 collections to:
  `sidekick.weekly_trending_collections`
- Writes status/debug data to:
  `sidekick.weekly_trending_last_run`
  and `sidekick.weekly_trending_debug`.

## Required scopes

```txt
read_orders,read_products,write_products
```

`read_orders` is enough for the 7-day window. `read_all_orders` is only needed
if you later expand the ranking window beyond Shopify's normal recent-order
access.

## Local setup

```shell
npm install
shopify app config link
shopify app dev
```

`shopify.app.toml` intentionally has placeholder URL/client values. Run
`shopify app config link` to connect this local source to a new Shopify app
registration, then update production URLs before deploying.

## Theme handoff

The product page section should read
`shop.metafields.sidekick.weekly_trending_collections.value` as a JSON array of
collection GIDs, then use those collections for slots 3 and 4.
