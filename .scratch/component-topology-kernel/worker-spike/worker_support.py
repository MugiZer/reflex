"""Request, artifact, logging, and geometry support for the spike worker."""
from __future__ import annotations
import json, os, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

def configure_windows_dlls():
    if os.name != "nt": return
    root=next(p for p in sys.path if p.endswith("site-packages")); venv=Path(root).parent.parent
    os.add_dll_directory(str(Path(root)/"netgen")); os.add_dll_directory(str(venv/"Library"/"bin"))

class WorkerFailure(Exception):
    def __init__(self,category,message): self.category,self.message=category,message; super().__init__(message)

def utc_now(): return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

def atomic_json(path:Path,payload:dict[str,Any]):
    path.parent.mkdir(parents=True,exist_ok=True); fd,temporary=tempfile.mkstemp(prefix=path.name+".",suffix=".tmp",dir=path.parent)
    try:
        with os.fdopen(fd,"w",encoding="utf-8",newline="\n") as output:
            json.dump(payload,output,indent=2,sort_keys=True); output.write("\n"); output.flush(); os.fsync(output.fileno())
        os.replace(temporary,path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def log(events,calculation_id,event,**fields):
    entry={"timestamp":utc_now(),"calculation_id":calculation_id,"event":event,**fields}; events.append(entry); print(json.dumps(entry,sort_keys=True),flush=True)

def check_request(request):
    recipe=request.get("recipe",{})
    if request.get("schema_version")!="topology-worker-spike/v1" or not request.get("calculation_id"): raise WorkerFailure("invalid_recipe","schema_version and calculation_id are required")
    if recipe.get("kind")!="repeating-parallel-profile-wall-2d" or recipe.get("profile",{}).get("kind")!="c": raise WorkerFailure("invalid_recipe","only a repeating C-profile wall is supported by this spike")
    profile=recipe["profile"]
    if any(not isinstance(profile.get(k),(int,float)) or profile[k]<=0 for k in ("gauge_m","web_m","flange_m")): raise WorkerFailure("invalid_geometry","profile gauge, web, and flange must be positive")
    if recipe.get("width_m",0)<=0 or recipe.get("repeat_m",0)<=0: raise WorkerFailure("invalid_geometry","wall width and repeat must be positive")
    sizes=request.get("controls",{}).get("mesh_sizes_m",[])
    if len(sizes)<3 or any(not isinstance(h,(int,float)) or h<=0 for h in sizes): raise WorkerFailure("mesh_failure","three positive mesh sizes are required")
    return recipe

def c_profile(recipe):
    from shapely.geometry import box
    from shapely.ops import unary_union
    p=recipe["profile"]; x,y,t,web,flange=(p[k] for k in ("x_m","y_m","gauge_m","web_m","flange_m"))
    steel=unary_union((box(x,y,x+t,y+web),box(x+t,y,x+flange,y+t),box(x+t,y+web-t,x+flange,y+web))); cell=box(0,0,recipe["width_m"],recipe["repeat_m"])
    if not steel.is_valid or steel.geom_type!="Polygon" or not cell.contains(steel): raise WorkerFailure("invalid_geometry","C profile is invalid or extends outside the periodic cell")
    insulation=cell.difference(steel)
    if not insulation.is_valid or insulation.area<=0: raise WorkerFailure("invalid_geometry","profile leaves no valid insulation region")
    return cell,steel,insulation
