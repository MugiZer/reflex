"""Analytical homogeneous periodic slab used by verify.py."""
from numerical_utils import hdiv_fluxes,reaction_flux,skeleton_flux,free_dof_residual
import worker_support as support
BOUNDARIES=("exterior","interior","periodic-bottom","periodic-top")

def solve(maxh):
    support.configure_windows_dlls()
    from netgen.geom2d import SplineGeometry
    from ngsolve import BND,BilinearForm,GridFunction,H1,Integrate,LinearForm,Mesh,Periodic,SymbolicBFI,TaskManager,grad
    width,repeat,k,cold,hot=.2,.6,.035,0.,20.; geo=SplineGeometry(); p=[geo.AppendPoint(x,y) for x,y in ((0,0),(width,0),(width,repeat),(0,repeat))]
    bottom=geo.Append(["line",p[0],p[1]],leftdomain=1,rightdomain=0,bc="periodic-bottom"); geo.Append(["line",p[1],p[2]],leftdomain=1,rightdomain=0,bc="interior"); geo.Append(["line",p[3],p[2]],leftdomain=0,rightdomain=1,bc="periodic-top",copy=bottom); geo.Append(["line",p[3],p[0]],leftdomain=1,rightdomain=0,bc="exterior"); geo.SetMaterial(1,"slab")
    mesh=Mesh(geo.GenerateMesh(maxh=maxh)); lengths={name:float(Integrate(1,mesh,BND,definedon=mesh.Boundaries(name))) for name in BOUNDARIES}; fes=Periodic(H1(mesh,order=1,dirichlet="exterior|interior")); u,v=fes.TnT(); a=BilinearForm(fes,symmetric=True); a+=SymbolicBFI(k*grad(u)*grad(v)); f=LinearForm(fes); temp=GridFunction(fes); temp.Set(mesh.BoundaryCF({"exterior":cold,"interior":hot},default=0),BND)
    with TaskManager(): a.Assemble(); f.Assemble(); temp.vec.data+=a.mat.Inverse(fes.FreeDofs())*(f.vec-a.mat*temp.vec)
    hdiv=hdiv_fluxes(mesh,temp,k,BOUNDARIES); reaction={name:reaction_flux(fes,a.mat,f.vec,temp,mesh,name) for name in ("exterior","interior")}; raw={name:skeleton_flux(mesh,temp,k,name) for name in BOUNDARIES}; energy=float(Integrate(k*grad(temp)*grad(temp),mesh)/(hot-cold))
    return {"maxh":maxh,"elements":mesh.ne,"expected_heat_flow_w_per_m":2.1,"boundary_lengths_m":lengths,"h1_skeleton_outward_w_per_m":raw,"dirichlet_reaction_w_per_m":reaction,"hdiv_recovered_outward_w_per_m":hdiv,"volume_energy_heat_flow_w_per_m":energy,"free_dof_solver_residual":free_dof_residual(a.mat,temp.vec,f.vec,fes.FreeDofs())}

def run_suite(): return [solve(h) for h in (.05,.025,.0125)]
