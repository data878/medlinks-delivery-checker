# MedLinks delivery checker

Vercel serverless API for the Shop MedLinks product-page delivery checker.

## Environment variables

- `ORIGIN_PINCODE=110029`
- `DELHIVERY_API_TOKEN` — production Delhivery token
- `SHADOWFAX_API_TOKEN` — production Shadowfax 360 token
- `SHADOWFAX_API_BASE_URL=https://dale.shadowfax.in/api`
- `CUTOFF_HOUR_IST=12`
- `ALLOWED_ORIGINS=https://shopmedlinks.com,https://www.shopmedlinks.com`
- `HOLIDAY_DATES` — optional comma-separated dates in `YYYY-MM-DD` format

The API tokens are server-side secrets and must never be committed to GitHub or added to the Shopify theme.

## Endpoints

- `GET /api/health`
- `GET /api/check-delivery?pincode=110001`

Shadowfax is treated as the primary serviceability provider. Delhivery supplies live COD and TAT data because the available Shadowfax API does not expose pre-purchase COD or TAT.
