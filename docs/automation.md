# Automated crime-data updates

At each scheduled check, the GitHub workflow downloads the official [BOCSAR suburb ZIP](https://bocsarblob.blob.core.windows.net/bocsar-open-data/SuburbData.zip), calculates the latest twelve consecutive monthly columns, and compares the results with the current snapshot. It combines incident counts with the existing 2021 Census population and suburb boundaries and recalculates the existing offence totals, rates, and tied ranks. The archive is streamed; the large CSV is not extracted. No commit is created when the resulting data and reporting period are unchanged.

The import checks the source columns, monthly sequence, offence mappings, suburb matches, and values. A reporting period older than the current snapshot is rejected. Changes to previously published months are included even when the latest month is unchanged. If the source or validation fails, the workflow fails before committing or deploying.

## Local verification

Run with Python 3 and Node.js 26:

~~~text
python work/update_crime_data.py --dry-run
python work/check_site.py
~~~

To inspect an already downloaded official ZIP without network access:

~~~text
python work/update_crime_data.py --archive /path/to/SuburbData.zip --dry-run
~~~

Omit --dry-run to update work/crime_data.json and work/crime_period.json. The check_site.py script runs the tests, builds the site, and verifies bilingual pages. The GitHub commit-step integration test runs on Linux and is explicitly skipped on Windows. Generated static files are in outputs/sydney-crime-seo/.

## GitHub workflow

The workflow in .github/workflows/update-crime-data.yml runs at 02:17 UTC on the 15th of each month and supports workflow_dispatch on main. It downloads the source, updates and validates the snapshot, builds the site, and commits the snapshot and generated static files only when the data or reporting period changed. The update job's built-in GITHUB_TOKEN needs contents: write; branch protection must permit this workflow to push. A failed push is reported as a failure.

Pull requests targeting main run a separate read-only verification job. On its Ubuntu runner this includes the commit-step integration test using a temporary local Git remote; it does not push project data or publish the site.

GitHub can disable scheduled workflows in public repositories with no activity for 60 days. The optional Cloudflare watchdog below can recover a workflow disabled for inactivity. A manual run can also be started from the Actions tab.

## Cloudflare scheduler

scheduler/src/index.mjs checks the GitHub workflow at 03:17 UTC on the 16th of each month, 25 hours after GitHub's normal scheduled run. If the workflow is active, it does not trigger another update. If GitHub reports disabled_inactivity, the watchdog enables the workflow and dispatches one update on main. It reports other workflow states, including disabled_manually, as errors and does not change them.

Set GITHUB_DISPATCH_TOKEN as a Cloudflare secret using a GitHub credential restricted to this repository with Actions: write permission. This permission is needed both to enable and dispatch the workflow. Do not put the credential in the repository. If the credential has an expiration date, renew it before expiry. This is a separate Worker from the website and must be deployed with its secret configured before it can run.

For initial rollout, deploy the separate Worker without a Cron Trigger, add the GitHub credential as a Cloudflare Secret, and only then apply the configured trigger. Keep GitHub's normal schedule enabled throughout. Verify the deployed trigger and a real authenticated check before relying on the watchdog.

The scheduler package declares pinned development dependencies with a lockfile. Install them with npm ci --ignore-scripts. A local cf deployment dry run checks the build but does not verify a real credential, Cron invocation, or GitHub recovery. Set CLOUDFLARE_AUTH_USE_KEYRING=true, require an available OS keyring, and do not fall back to plaintext credentials. Check Cloudflare logs and GitHub Actions for failures. If enabling succeeds but dispatch fails, the invocation fails visibly; the normal GitHub schedule remains enabled and the failed dispatch requires investigation. The watchdog does not repair failed data validations, a manually disabled workflow, or other missed scheduled runs.

## Cloudflare site builds

Connect the existing sydney-crime-map Worker to Revolt3738/sydney-crime-map on main using Workers Builds. Use:

- Build command: npm ci --ignore-scripts --no-audit --no-fund && python work/check_site.py
- Deploy command: python work/deploy_site.py

Set the Workers Builds variable SKIP_DEPENDENCY_INSTALL=1 so the explicit build command controls installation and does not run package scripts. The root package pins cf 1.0.0-beta.32 with a lockfile; a local static-site deployment dry run passed on Windows. The Linux deployment wrapper requires an unlocked default Secret Service keyring and sets CLOUDFLARE_AUTH_USE_KEYRING=true before calling the locally installed cf. It fails if the keyring or CLI is unavailable. Do not add an automatic plaintext credential fallback. Cloudflare's standard build image does not document an installed keyring service, so that prerequisite and the existing custom-domain configuration must be verified before enabling production deployment.

When connecting the repository, verify that a commit pushed by the update workflow is received by Workers Builds and that the deployed site's reporting period matches work/crime_period.json. GitHub's GITHUB_TOKEN pushes do not start another GitHub push workflow, so the build and validation are performed in the update workflow and in Workers Builds itself.

## Monitoring and recovery

Check GitHub Actions for download, conversion, test, or push failures; check the Cloudflare scheduler and Workers Builds for dispatch or deployment failures. Configure account notifications for both services. A failed build does not publish the new site; investigate the error and run the workflow again after fixing it. The repository history and Cloudflare deployment history retain earlier versions.
