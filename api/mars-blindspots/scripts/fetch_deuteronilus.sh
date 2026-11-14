#!/bin/bash
# Download all raw data for the Deuteronilus Mensae demo into data_raw/ (gitignored).
# Safe to re-run: skips files that already exist. Never touches data_raw/gale_dtm.IMG.
set -e
cd "$(dirname "$0")/.."
mkdir -p data_raw/swim data_raw/baker_carter

get() {  # get URL DEST
  if [ -s "$2" ]; then echo "✓ exists: $2"; else echo "↓ $2"; curl -L --fail --progress-bar -o "$2" "$1"; fi
}

# HiRISE DTM + orthoimage — "Surface Features Emanating from Alcove in Deuteronilus Mensae"
# 40.74°N, 30.18°E, 1.00 m/px. NASA/JPL/University of Arizona.
D=https://hirise.lpl.arizona.edu/PDS/DTM/ESP/ORB_041200_041299/ESP_041222_2210_ESP_040787_2210
get "$D/DTEEC_041222_2210_040787_2210_A01.IMG"   data_raw/deut_041222_dtm.IMG     # ~389 MB
get "$D/ESP_041222_2210_RED_C_01_ORTHO.JP2"       data_raw/deut_041222_ortho.JP2   # ~35 MB (reduced-res ortho)

# Baker & Carter (2023) SHARAD mantle-ice data, Zenodo 10.5281/zenodo.7753745, CC BY 4.0
for f in readme.txt ds01.txt ds02.zip ds03.zip; do
  get "https://zenodo.org/records/7753745/files/$f?download=1" "data_raw/baker_carter/$f"
done
( cd data_raw/baker_carter && for z in ds02.zip ds03.zip; do unzip -n -q "$z" -d "${z%.zip}"; done )

# SWIM ice consistency maps (3 km/px, simple cylindrical, nodata -30).
# The SWIM page uses download buttons. If no GeoTIFFs are in data_raw/swim/, download them by hand:
#   https://swim.psi.edu/SWIM4MIMProducts.php → Combined Ice Consistency 0-1 m, 1-5 m, >5 m → GeoTIFF
ls data_raw/swim/*.tif* >/dev/null 2>&1 && echo "✓ SWIM GeoTIFFs present" || echo "⚠ SWIM GeoTIFFs missing — see comment above"
echo "Done."
