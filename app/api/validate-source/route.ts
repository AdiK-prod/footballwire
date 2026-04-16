import { handleValidateSourceRequest } from "@/lib/services/validateSourceHttp";

/** Thin wrapper; production uses root `api/validate-source.ts` on Vercel. */

export const POST = (request: Request) => handleValidateSourceRequest(request);
