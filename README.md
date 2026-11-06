# MedLinks delivery checker

Vercel serverless API for the Shop MedLinks product-page delivery checker.

## Environment variables

- `ORIGIN_PINCODE=110029`
- `DELHIVERY_API_TOKEN` — production Delhivery token
- `SHADOWFAX_API_TOKEN` — production Shadowfax 360 token
- `SHADOWFAX_API_BASE_URL=https://dale.shadowfax.in/api`
- `CUTOFF_HOUR_IST=14`
- `SHADOWFAX_REQUIRED_TIER=Regular` — only the account's applicable tier counts as serviceable
- `SHADOWFAX_NEXT_DAY_PINCODES` — verified comma-separated Shadowfax Next Day PIN codes
- `ALLOWED_ORIGINS=https://shopmedlinks.com,https://www.shopmedlinks.com`
- `HOLIDAY_DATES` — optional comma-separated dates in `YYYY-MM-DD` format

The API tokens are server-side secrets and must never be committed to GitHub or added to the Shopify theme.

## Endpoints

- `GET /api/health`
- `GET /api/check-delivery?pincode=110001`

Shadowfax is treated as the primary serviceability provider. A PIN code is only accepted when the account's applicable `Regular` tier is returned. Next Day Delivery is shown only for PIN codes explicitly supplied through `SHADOWFAX_NEXT_DAY_PINCODES`; it is never inferred from Delhivery's TAT. Delhivery supplies live COD data and remains the fallback courier when Shadowfax is unavailable.
