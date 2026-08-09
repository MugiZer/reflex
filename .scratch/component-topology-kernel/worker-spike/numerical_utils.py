"""Normally imported numerical diagnostics shared by slab and C-profile solves."""
def free_dof_residual(matrix,solution,rhs,free_dofs):
    residual=rhs.CreateVector(); residual.data=matrix*solution-rhs
    squared=sum(float(residual[i])**2 for i in range(len(residual)) if free_dofs[i]); rhs_squared=sum(float(rhs[i])**2 for i in range(len(rhs)) if free_dofs[i])
    return squared**.5/max(1.0,rhs_squared**.5)

def skeleton_flux(mesh,temperature,conductivity,boundary):
    from ngsolve import BND,LinearForm,NumberSpace,SymbolicLFI,grad,specialcf
    space=NumberSpace(mesh); form=LinearForm(space); form+=SymbolicLFI(-conductivity*grad(temperature)*specialcf.normal(2)*space.TestFunction(),BND,skeleton=True,definedon=mesh.Boundaries(boundary)); form.Assemble(); return float(sum(form.vec))

def reaction_flux(fes,matrix,rhs,temperature,mesh,boundary):
    from ngsolve import GridFunction
    residual=rhs.CreateVector(); residual.data=matrix*temperature.vec-rhs; marker=GridFunction(fes); marker.Set(1,definedon=mesh.Boundaries(boundary)); return float(sum(marker.vec[i]*residual[i] for i in range(len(residual))))

def hdiv_fluxes(mesh,temperature,conductivity,boundaries):
    from ngsolve import BND,GridFunction,HDiv,LinearForm,NumberSpace,SymbolicLFI,grad,specialcf
    recovered=GridFunction(HDiv(mesh,order=1)); recovered.Set(-conductivity*grad(temperature)); values={}
    for boundary in boundaries:
        space=NumberSpace(mesh); form=LinearForm(space); form+=SymbolicLFI(recovered*specialcf.normal(2)*space.TestFunction(),BND,skeleton=True,definedon=mesh.Boundaries(boundary)); form.Assemble(); values[boundary]=float(sum(form.vec))
    return values
