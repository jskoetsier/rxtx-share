import { Prisma } from "@prisma/client";

export const sharePublicInclude = {
  files: { orderBy: { name: "asc" as const } },
  creator: true,
  security: true,
} satisfies Prisma.ShareInclude;

export type SharePublicDto = Prisma.ShareGetPayload<{
  include: typeof sharePublicInclude;
}> & { hasPassword: boolean };
