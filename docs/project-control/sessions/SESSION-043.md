# SESSION-043 — Current UI preview verification trigger

Date: 2026-10-05
Owner: ChatGPT
Branch: feature/ai-core-from-doable-source

The Vercel project ignore-build-step command is explicitly set to `exit 1` so the feature branch is forced through the preview build path. This is a deployment-control operation only.

Expected next evidence:
- Vercel build must reach READY or expose a concrete build failure.
- The deployment must correspond to this commit.
- No production promotion is authorized by this checkpoint.
