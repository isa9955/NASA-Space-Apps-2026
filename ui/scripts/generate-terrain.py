import json, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[2]
source=root/'api/mars-blindspots/data/deuteronilus/data_grid.json'
g=json.loads(source.read_text())
rows=sorted(set(range(0,g['grid_rows'],2))|{g['grid_rows']-1})
cols=sorted(set(range(0,g['grid_cols'],2))|{g['grid_cols']-1})
t=dict(rows=len(rows),cols=len(cols),rowFractions=[r/(g['grid_rows']-1) for r in rows],colFractions=[c/(g['grid_cols']-1) for c in cols],elevation=[[g['elevation'][r][c] for c in cols] for r in rows],sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),regionId='deuteronilus-mensae')
out=root/'ui/public/terrain/deuteronilus.json'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(t,separators=(',',':')))
print(out)
