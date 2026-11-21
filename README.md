# Project Revival

## MG Pro production architecture

Production runs only on the owner's **Fly.io/VPS Node deployment**, using the existing Supabase project and services. Lovable is the development editor/agent/preview only; never publish this application to Lovable hosting or move its database to Lovable Cloud.

The Fly application is `m-hamo`; the existing domain is `mag-pro1.com`. See `FLYIO.md`, `selfhost/README.md` and `LAUNCH-READINESS-2026-11-21.md` for current launch gates. Historical migration/hosting instructions are not an authorization to change production.

في مشروع انا عاملو علي جيت هاب عايزك تعملو استرداد وتبنيه تاني

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/335637d3-bc9b-407f-9e44-b28bda5c78dc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
