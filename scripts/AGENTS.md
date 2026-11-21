# Self-hosted runtime
- Production launches only a prebuilt Nitro Node artifact; missing artifacts fail rather than building on boot, because runtime images do not contain build dependencies.
- Resolve dynamic filesystem entry imports with pathToFileURL so Windows and paths containing spaces remain valid.
- Runtime credentials never enter Docker build context/stages; only public VITE_* build arguments are allowed, while Fly/Compose inject server secrets at runtime.
- Launcher tests use temporary fixture modules and must never be reported as application production build/boot verification.