import { z } from "zod";
import { greenStarImportTargetSchema, greenStarImportSchema } from "@/lib/green-star-import-schema";

export const participantImportSchema = z.object({
  target: greenStarImportTargetSchema.options[1].extend({ mode: z.literal("participants") }),
  studentCodes: greenStarImportSchema.shape.studentCodes,
  requestId: z.uuid(),
});
