#!/usr/bin/env python3
"""Canonical one-shot topology worker for Ticket 01."""
from __future__ import annotations
import argparse,json,os,platform,sys,time,traceback
from pathlib import Path
import c_profile_solver,worker_support as support

def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--request",type=Path,required=True); parser.add_argument("--output",type=Path,required=True); parser.add_argument("--simulate",choices=("missing_dependency","crash","partial_write","non_convergence","timeout")); args=parser.parse_args(); events=[]
    try: request=json.loads(args.request.read_text(encoding="utf-8"))
    except Exception as error: request={}; calculation_id="unknown"; support.atomic_json(args.output/"error.json",{"schema_version":"topology-worker-error/v1","calculation_id":calculation_id,"category":"invalid_recipe","message":str(error),"events":events}); return 2
    calculation_id=request.get("calculation_id","unknown"); support.log(events,calculation_id,"started",pid=os.getpid())
    try:
        if args.simulate=="missing_dependency": raise support.WorkerFailure("missing_dependency","simulated required native dependency is unavailable")
        if args.simulate=="crash": os._exit(91)
        if args.simulate=="timeout": time.sleep(60)
        if args.simulate=="partial_write": (args.output/"result.json.partial").parent.mkdir(parents=True,exist_ok=True); (args.output/"result.json.partial").write_text("{partial",encoding="utf-8"); raise support.WorkerFailure("partial_write","simulated interrupted publication")
        recipe=support.check_request(request)
        if args.simulate=="non_convergence": raise support.WorkerFailure("solver_non_convergence","simulated solver convergence limit")
        refinements=[]
        for mesh_size in request["controls"]["mesh_sizes_m"]:
            started=time.perf_counter(); run=c_profile_solver.solve_refinement(recipe,mesh_size); run["runtime_s"]=time.perf_counter()-started; previous=refinements[-1]["u_value_w_m2k"] if refinements else None; run["relative_change"]=None if previous is None else abs(run["u_value_w_m2k"]-previous)/abs(previous); refinements.append(run); support.log(events,calculation_id,"refinement_completed",mesh_size_m=mesh_size,element_count=run["element_count"])
        threshold=request["controls"]["relative_tolerance"]; converged=refinements[-1]["relative_change"] is not None and refinements[-1]["relative_change"]<=threshold; status="converged" if converged else "completed_unconverged"; result={"schema_version":"topology-worker-result/v1","calculation_id":calculation_id,"status":status,"convergence_threshold":threshold,"refinements":refinements,"environment":{"python":sys.version,"platform":platform.platform()},"completed_at":support.utc_now()}; support.log(events,calculation_id,"completed",status=status); support.atomic_json(args.output/"result.json",result); support.atomic_json(args.output/"structured-log.json",{"calculation_id":calculation_id,"events":events}); return 0
    except support.WorkerFailure as error:
        support.log(events,calculation_id,"failed",category=error.category,message=error.message); support.atomic_json(args.output/"error.json",{"schema_version":"topology-worker-error/v1","calculation_id":calculation_id,"category":error.category,"message":error.message,"events":events}); support.atomic_json(args.output/"structured-log.json",{"calculation_id":calculation_id,"events":events}); return 2
    except Exception as error:
        support.log(events,calculation_id,"failed",category="internal_error",message=str(error)); support.atomic_json(args.output/"error.json",{"schema_version":"topology-worker-error/v1","calculation_id":calculation_id,"category":"internal_error","message":str(error),"traceback":traceback.format_exc(),"events":events}); support.atomic_json(args.output/"structured-log.json",{"calculation_id":calculation_id,"events":events}); return 3
if __name__=="__main__": raise SystemExit(main())
