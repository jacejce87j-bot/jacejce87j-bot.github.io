---
name: Form component context
description: Context requirements for the Web UI's shared form components.
---

The shared form components are context-bound: `FormLabel`, `FormControl`, and `FormMessage` must be rendered inside the matching `FormField` and `FormItem` providers. Standalone controls such as optional template selectors need a native `<label>` or another context-independent label.

**Why:** The components call `useFormField()` and intentionally throw when their provider context is missing. This can remain hidden until conditional production data causes the standalone control to render.

**How to apply:** When adding a label or validation message outside a field renderer, do not reuse the context-bound form components; use a normal label/text element instead.