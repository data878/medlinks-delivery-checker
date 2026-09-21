# Privacy policy date updater

Changes only the existing `Last Updated:` date in the saved Shopify PRIVACY_POLICY to two calendar days before the current date in Asia/Kolkata. Both storefront and customer-account policy views use that saved policy. No delivery code is modified.

## Activate

1. In this Vercel project's Production environment, configure SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET and SHOPIFY_STORE_DOMAIN=xdthfp-z0.myshopify.com. The installed app needs read_legal_policies and write_legal_policies. Client credentials authentication requires the app and store to belong to the same Shopify organization.
2. Add CRON_SECRET: a password-manager-generated random value of at least 32 characters. Keep it private. Vercel supplies this as the cron request's Bearer authorization header.
3. Merge this change to main and confirm the Vercel Production deployment is Ready. Environment changes require a new deployment.
4. Open Vercel Settings > Cron Jobs and run /api/update-policy-date once. Check logs for a 200 response. Verify the saved policy date in Shopify Settings > Policies, then reload both customer-account and storefront policy views.

The cron expression 30 18 * * * is midnight in India. Hobby scheduling may run within the following hour, so the existing storefront script can briefly lead the saved policy date. This is daily automation, not guaranteed exact-midnight synchronization. Preview deployments do not run the schedule.

The endpoint refuses unauthenticated calls, missing configuration, a different shop or policy, and missing/duplicate date labels. It fetches the current policy each time, checks again before writing, and verifies the saved result. Shopify has no compare-and-swap argument for this mutation, so avoid editing the policy during its brief daily run. Authentication is renewed each run. Failed jobs return an error; do not assume a date was updated after a failed run. Inspect Vercel logs and run again after fixing the cause.

## Disable

Disable the cron job in Vercel. This leaves the last saved date intact. The previously added theme script is independent; remove it separately if automatic storefront display is no longer wanted.

## Validation

Run npm test. Tests cover India midnight, leap dates, month/year boundaries, ordinals, exact text preservation, duplicate/missing labels, idempotence and unauthorized requests. Live credential permissions and customer-account rendering require the activation check above.
