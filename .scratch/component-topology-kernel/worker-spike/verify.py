"""Complete Ticket 01 verification through the canonical worker path."""
from __future__ import annotations
import json,os,shutil,subprocess
from pathlib import Path
import homogeneous_slab
ROOT=Path(__file__).parent; PYTHON=Path(os.environ.get("TOPOLOGY_WORKER_PYTHON",ROOT/".venv"/"Scripts"/"python.exe")); WORKER=ROOT/"topology_worker.py"; OUT=ROOT/"artifacts"/"verification"
CONVERGENCE=.005; METHOD=.001; HOT_COLD=.005; PERIODIC=.001
def expect(value,message):
    if not value: raise AssertionError(message)
def close(actual,expected,tolerance,message): expect(abs(actual-expected)<=tolerance*max(abs(expected),1e-12),f"{message}: {actual} vs {expected}")
def run(name,fixture,simulate=None,timeout=45):
    folder=OUT/name
    if folder.exists(): shutil.rmtree(folder)
    folder.mkdir(parents=True); request=folder/"request.json"; shutil.copy2(ROOT/"fixtures"/fixture,request); command=[str(PYTHON),str(WORKER),"--request",str(request),"--output",str(folder)]+(["--simulate",simulate] if simulate else [])
    try: done=subprocess.run(command,text=True,capture_output=True,timeout=timeout)
    except subprocess.TimeoutExpired as error: done=subprocess.CompletedProcess(command,124,error.stdout or "",error.stderr or "")
    (folder/"stdout.log").write_text(done.stdout or "",encoding="utf-8"); (folder/"stderr.log").write_text(done.stderr or "",encoding="utf-8"); return done,folder
def verify_slab():
    runs=homogeneous_slab.run_suite()
    for run in runs:
        close(run["expected_heat_flow_w_per_m"],2.1,1e-12,"analytical definition")
        for name,length in (("exterior",.6),("interior",.6),("periodic-bottom",.2),("periodic-top",.2)): close(run["boundary_lengths_m"][name],length,1e-12,f"{name} length")
        hdiv=run["hdiv_recovered_outward_w_per_m"]; reaction=run["dirichlet_reaction_w_per_m"]; energy=run["volume_energy_heat_flow_w_per_m"]
        expect(hdiv["exterior"]>0 and hdiv["interior"]<0,"nonzero independent slab face flux/sign")
        close(hdiv["exterior"],2.1,1e-10,"slab cold flux"); close(-hdiv["interior"],2.1,1e-10,"slab hot flux"); close(-reaction["exterior"],2.1,1e-10,"slab cold reaction"); close(reaction["interior"],2.1,1e-10,"slab hot reaction"); close(energy,2.1,1e-10,"slab energy")
        expect(abs(hdiv["periodic-bottom"]+hdiv["periodic-top"])<=1e-12,"slab periodic net")
    changes=[abs(runs[i]["hdiv_recovered_outward_w_per_m"]["exterior"]-runs[i-1]["hdiv_recovered_outward_w_per_m"]["exterior"])/2.1 for i in (1,2)]; expect(max(changes)<1e-10,"slab refinement convergence")
    support={"schema_version":"homogeneous-slab-verification/v1","status":"converged","runs":runs}; (OUT/"homogeneous-slab").mkdir(parents=True,exist_ok=True); (OUT/"homogeneous-slab"/"result.json").write_text(json.dumps(support,indent=2)+"\n",encoding="utf-8")
def verify_c_profile():
    done,folder=run("valid-c-profile","valid-c-wall.json",timeout=120); expect(done.returncode==0 and (folder/"result.json").exists(),"canonical C-profile failed"); result=json.loads((folder/"result.json").read_text()); expect(result["status"]=="converged","C-profile status"); final=result["refinements"][-1]; expect(final["relative_change"]<CONVERGENCE,"final refinement change")
    flux=final["fluxes_w_per_m"]; hdiv=flux["hdiv_recovered_outward"]; reaction=flux["dirichlet_reaction"]; energy=flux["volume_energy_heat_flow"]; hot=-hdiv["interior"]; cold=hdiv["exterior"]; through=max(abs(hot),abs(cold)); expect(hot>0 and cold>0,"nonzero independent C-profile face fluxes"); expect(abs(hot-cold)/through<=HOT_COLD,"Ticket 03 hot/cold balance"); expect(abs(hdiv["periodic-bottom"]+hdiv["periodic-top"])/through<=PERIODIC,"Ticket 03 periodic balance"); close(cold,-reaction["exterior"],METHOD,"cold H(div)/reaction"); close(hot,reaction["interior"],METHOD,"hot H(div)/reaction"); close((hot+cold)/2,energy,METHOD,"H(div)/energy")
def verify_failures():
    for name,fixture,simulate,category in (("invalid-recipe","invalid-recipe.json",None,"invalid_recipe"),("invalid-geometry","invalid-geometry.json",None,"invalid_geometry"),("mesh-failure","pathological-mesh.json",None,"mesh_failure"),("missing-dependency","valid-c-wall.json","missing_dependency","missing_dependency"),("non-convergence","valid-c-wall.json","non_convergence","solver_non_convergence"),("partial-write","valid-c-wall.json","partial_write","partial_write")):
        done,folder=run(name,fixture,simulate); expect(done.returncode==2 and (folder/"error.json").exists() and not (folder/"result.json").exists(),f"{name} atomic failure"); expect(json.loads((folder/"error.json").read_text())["category"]==category,f"{name} category"); expect(not list(folder.glob("result.json.*.tmp")),f"{name} temp publication")
    done,folder=run("crash","valid-c-wall.json","crash"); expect(done.returncode==91 and not (folder/"result.json").exists(),"crash exit")
    done,folder=run("timeout","valid-c-wall.json","timeout",1); expect(done.returncode==124 and not (folder/"result.json").exists(),"timeout exit")
def main():
    expect(PYTHON.exists(),"missing pinned Python environment"); verify_slab(); verify_c_profile(); verify_failures(); print("PASS: topology worker spike verified")
if __name__=="__main__": main()
