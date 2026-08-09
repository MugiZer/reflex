"""Corrected copied-edge C-profile solver using H(div) recovered face flux."""
from numerical_utils import free_dof_residual,hdiv_fluxes,reaction_flux,skeleton_flux
import worker_support as support
BOUNDARIES=("exterior","interior","periodic-bottom","periodic-top")

def pathological_mesh_failure():
    from netgen.geom2d import SplineGeometry
    geo=SplineGeometry(); p=[geo.AppendPoint(x,y) for x,y in ((0,0),(1,0),(1,1),(0,1),(.2,.2),(.8,.8),(.2,.8),(.8,.2))]
    for a,b in ((0,1),(1,2),(2,3),(3,0)): geo.Append(["line",p[a],p[b]],leftdomain=1,rightdomain=0)
    for a,b in ((4,5),(5,6),(6,7),(7,4)): geo.Append(["line",p[a],p[b]],leftdomain=2,rightdomain=1)
    geo.GenerateMesh(maxh=.1)

def solve_refinement(recipe,mesh_size):
    support.configure_windows_dlls()
    from shapely.geometry.polygon import orient
    from netgen.geom2d import SplineGeometry
    from ngsolve import BND,BilinearForm,GridFunction,H1,Integrate,LinearForm,Mesh,Periodic,SymbolicBFI,TaskManager,grad
    if recipe.get("pathological_mesh"):
        try: pathological_mesh_failure()
        except Exception as error: raise support.WorkerFailure("mesh_failure",f"Netgen rejected self-intersecting loop: {error}") from error
        raise support.WorkerFailure("mesh_failure","pathological mesh unexpectedly succeeded")
    cell,steel,insulation=support.c_profile(recipe); width,repeat=recipe["width_m"],recipe["repeat_m"]; geo=SplineGeometry(); p=[geo.AppendPoint(x,y) for x,y in ((0,0),(width,0),(width,repeat),(0,repeat))]
    bottom=geo.Append(["line",p[0],p[1]],leftdomain=1,rightdomain=0,bc="periodic-bottom"); geo.Append(["line",p[1],p[2]],leftdomain=1,rightdomain=0,bc="interior"); geo.Append(["line",p[3],p[2]],leftdomain=0,rightdomain=1,bc="periodic-top",copy=bottom); geo.Append(["line",p[3],p[0]],leftdomain=1,rightdomain=0,bc="exterior")
    coords=list(orient(steel,sign=1.).exterior.coords); points=[geo.AppendPoint(x,y) for x,y in coords[:-1]]; interface_maxh=min(mesh_size,recipe["profile"]["gauge_m"]/2)
    for i,point in enumerate(points): geo.Append(["line",point,points[(i+1)%len(points)]],leftdomain=2,rightdomain=1,maxh=interface_maxh)
    geo.SetMaterial(1,"insulation"); geo.SetMaterial(2,"steel")
    try: mesh=Mesh(geo.GenerateMesh(maxh=mesh_size))
    except Exception as error: raise support.WorkerFailure("mesh_failure",str(error)) from error
    fes=Periodic(H1(mesh,order=1,dirichlet="exterior|interior")); k_ins=recipe["conductivity_w_mk"]["insulation"]; conductivity=mesh.MaterialCF({"insulation":k_ins,"steel":recipe["conductivity_w_mk"]["steel"]}); u,v=fes.TnT(); a=BilinearForm(fes,symmetric=True); a+=SymbolicBFI(conductivity*grad(u)*grad(v)); f=LinearForm(fes); temp=GridFunction(fes); cold,hot=recipe["boundary_temperature_c"]["exterior"],recipe["boundary_temperature_c"]["interior"]; temp.Set(mesh.BoundaryCF({"exterior":cold,"interior":hot},default=0),BND)
    with TaskManager(): a.Assemble(); f.Assemble(); temp.vec.data+=a.mat.Inverse(fes.FreeDofs())*(f.vec-a.mat*temp.vec)
    raw={name:skeleton_flux(mesh,temp,k_ins,name) for name in BOUNDARIES}; reaction={name:reaction_flux(fes,a.mat,f.vec,temp,mesh,name) for name in ("exterior","interior")}; recovered=hdiv_fluxes(mesh,temp,conductivity,BOUNDARIES); energy=float(Integrate(conductivity*grad(temp)*grad(temp),mesh)/(hot-cold)); heat_flow=(recovered["exterior"]-recovered["interior"])/2
    return {"mesh_size_m":mesh_size,"thin_interface_maxh_m":interface_maxh,"element_count":mesh.ne,"heat_flow_w_per_m":heat_flow,"u_value_w_m2k":heat_flow/(repeat*(hot-cold)),"free_dof_solver_residual":free_dof_residual(a.mat,temp.vec,f.vec,fes.FreeDofs()),"fluxes_w_per_m":{"h1_skeleton_outward":raw,"dirichlet_reaction":reaction,"hdiv_recovered_outward":recovered,"volume_energy_heat_flow":energy},"flux_balance_w_per_m":{"hot_in":-recovered["interior"],"cold_out":recovered["exterior"],"periodic_net_out":recovered["periodic-bottom"]+recovered["periodic-top"],"hot_cold_imbalance":-recovered["interior"]-recovered["exterior"],"energy_minus_face_mean":energy-heat_flow},"region_areas_m2":{"steel":steel.area,"insulation":insulation.area},"periodic_edge_copy":{"source":"periodic-bottom","copy":"periodic-top","same_direction":True}}
