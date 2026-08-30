# Corrective prompt

Paste this into Claude Code. It undoes a build that was made from the
documentation prose instead of the prototype.

---

> Read CLAUDE.md again, particularly the section "The design is already decided
> — do not invent one". Then open `prototype/proof.html` in a browser and look
> at it before you touch any code.
>
> What is currently deployed was built from the prose in the documentation. The
> copy was rewritten, the typography is serif, and none of the seven pages
> exist. That is not what this product looks like.
>
> Rebuild the front end from the prototype:
>
> - **Copy**: take the prototype's wording verbatim. The headline is "Signals
>   with their reasons attached. / Including the ones that failed." Do not
>   paraphrase it and do not write new marketing prose.
> - **Type**: Inter Tight for headings, Inter for body, JetBrains Mono with
>   tabular figures for every number. No serif anywhere.
> - **Tokens**: exactly the CSS variables listed in CLAUDE.md.
> - **Pages**: Home, Register, Hindsight, Triage, Custody, Keys, Method, plus
>   the call detail view. Same names, same order in the nav.
> - **Home order**: hero text, then the live register preview, then the key
>   gallery, then the three feature cards, then chain strip, method, metrics,
>   closing CTA. That order was chosen deliberately — the product comes before
>   the access key.
>
> Before you show me anything, put your build and the prototype side by side in
> a browser and tell me every place they differ. I would rather hear a list of
> differences than be told it is done.
