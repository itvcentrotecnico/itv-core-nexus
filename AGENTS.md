<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- AI text generation runs only in server functions (*.functions.ts) via the Lovable AI Gateway Responses API with streamText; why: keeps the key server-side and avoids buffered timeouts.
- Resumo Executivo Semanal: indicators are computed only by SQL (`_resumo_calcular`/`_resumo_montar`) and each generation is stored as a frozen version; AI only rewrites text from those indicators and falls back to the structured text. Why: reports must stay traceable and never change silently.
- Financial HML integration uses a server-only shared bearer credential at a GET-only public API backed by one fixed STABLE SQL read function; no database credential, arbitrary table/field/RPC selection, or employee account is given to the consumer. Why: isolate the consumer without changing existing user permissions.
- Weekly schedules use permission-checked SQL RPCs with revision checks and immutable publication snapshots; employee reads project only rows linked through colaboradores.user_id, and publication triggers require every scheduled employee to have active individual access. Why: prevent concurrent overwrites, inaccessible publications and exposure of coworkers or drafts.
- Schedule breaks store explicit start/end minutes alongside legacy duration; pending identities may exist only in drafts, coverage checks subtract breaks, and publication requires a recorded justification for warnings. Why: preserve history without treating suggestions or unknown identities as confirmed schedules.
- Shared reference SELECT policies use reference_module_access with explicit consumer modules; role permissions expose only the caller's active roles or authorized permission managers, and settings are key-scoped. Why: reference lookups must not grant every signed-in user unrestricted configuration or supplier access.
