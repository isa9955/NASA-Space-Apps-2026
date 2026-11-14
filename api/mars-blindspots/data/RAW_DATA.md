# Raw data (not in this repo)

The raw inputs are **not committed**. The processed grids in `data/deuteronilus/` are enough for routing and
zones. You only need the raw files to regenerate those grids.

Get them with the fetch script, run from `api/mars-blindspots/`:

```bash
scripts/fetch_deuteronilus.sh      # downloads into data_raw/ (gitignored); skips files already present
```

Then check them against the table (`shasum -a 256 data_raw/<file>`).

| File (in `data_raw/`) | Size (bytes) | Source URL | SHA-256 |
|---|---|---|---|
| `deut_041222_dtm.IMG` | 388,945,620 | https://hirise.lpl.arizona.edu/PDS/DTM/ESP/ORB_041200_041299/ESP_041222_2210_ESP_040787_2210/DTEEC_041222_2210_040787_2210_A01.IMG | `3960ea48d43f3d823d79c4dd253a131e15cf9b5dfa5090f8cc92909f522bb13c` |
| `deut_041222_ortho.JP2` | 35,109,932 | https://hirise.lpl.arizona.edu/PDS/DTM/ESP/ORB_041200_041299/ESP_041222_2210_ESP_040787_2210/ESP_041222_2210_RED_C_01_ORTHO.JP2 | `bde52f8a09104451350a6da34dc4b6c0287e54793d6f52d3156302899b7a7035` |
| `baker_carter/readme.txt` | 3,326 | https://zenodo.org/records/7753745/files/readme.txt?download=1 | `0b50d34877f78fbf46fa674a78639a717e7ee7d08448ffd816d5a353e967979b` |
| `baker_carter/ds01.txt` | 248,822 | https://zenodo.org/records/7753745/files/ds01.txt?download=1 | `05226eb7d77b83db85023156513f214dc9c3d3591f78dba86efc9865a612d705` |
| `baker_carter/ds02.zip` | 256,194 | https://zenodo.org/records/7753745/files/ds02.zip?download=1 | `41c240ff03ef3098ccf5b3ae0fa30bc9b2e0e40496c69b895719d0a7c3f2dcb2` |
| `baker_carter/ds03.zip` | 2,243,003 | https://zenodo.org/records/7753745/files/ds03.zip?download=1 | `e0d5125328ab1e0bd321d84459dca93968cb09f7ff150d0f9ca79a6098054d92` |

## Credits and licences
- **HiRISE DTM and orthoimage** DTEEC_041222_2210_040787_2210_A01 / ESP_041222_2210: NASA/JPL/University of Arizona.
- **Baker & Carter 2023**, *JGR Planets*, "Buried Glaciers and Ice Content of Mantling Materials in Deuteronilus
  Mensae, Mars". Data: Zenodo doi:10.5281/zenodo.7753745, **CC BY 4.0** (attribution required). No point in these
  files falls inside the DTM footprint (the nearest is ~77 km away), so they are regional context only.

## Notes
- The DTM (389 MB) is over GitHub's 100 MB per-file limit, which is one reason none of these files are committed.
- The ortho's embedded projection is misread by GDAL (lat_ts=0, lat_0=40). It sits on the same 1.0017 m pixel grid as
  the DTM, so use the DTM's CRS.
- **SWIM ice-consistency GeoTIFFs** (Morgan, Putzig et al.) are not fetched automatically. The products page
  (https://swim.psi.edu/SWIM4MIMProducts.php) uses form buttons and was unreachable on 2026-11-14, so download
  them by hand into `data_raw/swim/`. They aren't used by any committed output yet.
