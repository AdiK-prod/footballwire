import { ZodError } from "zod";
import { validateSource, validateSourceInput } from "@/lib/services/sourceService";

type ErrorResponse = {
  ok: false;
  error: string;
  details?: unknown;
};

type SuccessResponse = {
  ok: true;
  data: Awaited<ReturnType<typeof validateSource>>;
};

const json = (body: ErrorResponse | SuccessResponse, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

export const POST = async (request: Request) => {
  try {
    const payload = await request.json();
    const input = validateSourceInput(payload);

    if (input.sourceType === "general") {
      return json(
        {
          ok: false,
          error: "General sources are pre-approved and bypass this endpoint.",
        },
        400,
      );
    }

    const result = await validateSource(input);

    return json(
      {
        ok: true,
        data: result,
      },
      200,
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return json(
        {
          ok: false,
          error: "Invalid request payload",
          details: error.issues,
        },
        400,
      );
    }

    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected server error",
      },
      500,
    );
  }
};
