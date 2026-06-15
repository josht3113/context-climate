name: Update ERSSTv5 SST Data

on:
  schedule:
    # Runs on the 12th of each month at 10:00 UTC
    # (data for the month two months prior is typically available by then)
    - cron: '0 10 12 * *'
  workflow_dispatch:   # allow manual trigger from the Actions tab

jobs:
  update-sst:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install netCDF4 numpy --quiet

      - name: Append latest ERSSTv5 month
        run: python scripts/update_ersst_monthly.py

      - name: Commit and push if data changed
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add public/pacific-sst-anomalies.json
          git diff --staged --quiet && echo "No changes to commit." || (
            git commit -m "Update ERSSTv5 SST data [$(date +'%Y-%m')]"
            git push
          )
